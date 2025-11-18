/*
  # Email Notification System with Resend Integration

  ## Overview
  Adds comprehensive email notification system for:
  - Low balance alerts (Pay Per Use only)
  - Insufficient wallet balance for monthly invoice (Pay Per Use only)
  - Weekly call activity summaries
  - Service interruption warnings (Unlimited plan - 9 days after past due)

  ## Changes to Existing Tables

  ### users.notification_preferences
  Adds new notification types to the existing JSONB structure:
  - `service_interruption_alerts` - Warnings about payment issues and service suspension
  - `insufficient_balance_alerts` - Alerts when wallet cannot cover monthly invoice

  ### billing_accounts
  Adds tracking fields for notification management:
  - `low_balance_threshold_cents` - Threshold for triggering low balance alerts (default: $10)
  - `last_low_balance_alert_at` - Timestamp of last low balance alert sent
  - `last_insufficient_balance_alert_at` - Timestamp of last insufficient balance alert sent
  - `last_interruption_warning_at` - Timestamp of last service interruption warning sent
  - `last_weekly_summary_at` - Timestamp of last weekly summary sent

  ## New Tables

  ### email_delivery_log
  Tracks all email notifications sent for audit and debugging:
  - Email type, recipient, status (sent/failed)
  - Delivery timestamps and error messages
  - Template data for debugging

  ## Security
  - Enable RLS on email_delivery_log
  - Users can view their own email logs
  - Admins have full access

  ## Notification Rules
  1. Low Balance Alert: Sent when wallet_cents < low_balance_threshold_cents (Pay Per Use only)
  2. Insufficient Balance Alert: Sent on 1st of month when month_spent_cents > wallet_cents (Pay Per Use only)
  3. Weekly Summary: Sent weekly with past 7 days call activity and costs
  4. Service Interruption: Sent 9 days after grace_until date passes (Unlimited plan only)
*/

-- ======================
-- UPDATE EXISTING TABLES
-- ======================

-- Add notification tracking fields to billing_accounts
ALTER TABLE billing_accounts
  ADD COLUMN IF NOT EXISTS low_balance_threshold_cents integer DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS last_low_balance_alert_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_insufficient_balance_alert_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_interruption_warning_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_weekly_summary_at timestamptz;

-- Add comments for clarity
COMMENT ON COLUMN billing_accounts.low_balance_threshold_cents IS 'Threshold in cents for triggering low balance alerts (default: 1000 = $10.00)';
COMMENT ON COLUMN billing_accounts.last_low_balance_alert_at IS 'Timestamp of last low balance alert email sent';
COMMENT ON COLUMN billing_accounts.last_insufficient_balance_alert_at IS 'Timestamp of last insufficient balance alert sent (1st of month)';
COMMENT ON COLUMN billing_accounts.last_interruption_warning_at IS 'Timestamp of last service interruption warning email sent';
COMMENT ON COLUMN billing_accounts.last_weekly_summary_at IS 'Timestamp of last weekly summary email sent';

-- Update default notification preferences for existing users
UPDATE users
SET notification_preferences = notification_preferences ||
  '{"service_interruption_alerts": true, "insufficient_balance_alerts": true}'::jsonb
WHERE notification_preferences IS NOT NULL
  AND NOT notification_preferences ? 'service_interruption_alerts';

-- Set default notification preferences for users with NULL preferences
UPDATE users
SET notification_preferences = '{
  "low_balance_alerts": true,
  "weekly_summaries": true,
  "service_interruption_alerts": true,
  "insufficient_balance_alerts": true
}'::jsonb
WHERE notification_preferences IS NULL;

-- ======================
-- CREATE NEW TABLES
-- ======================

-- Create email_delivery_log table
CREATE TABLE IF NOT EXISTS email_delivery_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email_type text NOT NULL CHECK (email_type IN (
    'low_balance_alert',
    'insufficient_balance_alert',
    'weekly_summary',
    'service_interruption_warning'
  )),
  recipient_email text NOT NULL,
  subject text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'bounced')),
  resend_message_id text,
  template_data jsonb DEFAULT '{}'::jsonb,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- ======================
-- CREATE INDEXES
-- ======================

-- email_delivery_log indexes
CREATE INDEX IF NOT EXISTS idx_email_delivery_log_user_id ON email_delivery_log(user_id);
CREATE INDEX IF NOT EXISTS idx_email_delivery_log_email_type ON email_delivery_log(email_type);
CREATE INDEX IF NOT EXISTS idx_email_delivery_log_status ON email_delivery_log(status);
CREATE INDEX IF NOT EXISTS idx_email_delivery_log_created_at ON email_delivery_log(created_at);
CREATE INDEX IF NOT EXISTS idx_email_delivery_log_user_type ON email_delivery_log(user_id, email_type);

-- billing_accounts notification tracking indexes
CREATE INDEX IF NOT EXISTS idx_billing_accounts_last_low_balance_alert ON billing_accounts(last_low_balance_alert_at);
CREATE INDEX IF NOT EXISTS idx_billing_accounts_last_weekly_summary ON billing_accounts(last_weekly_summary_at);

-- ======================
-- ENABLE ROW LEVEL SECURITY
-- ======================

ALTER TABLE email_delivery_log ENABLE ROW LEVEL SECURITY;

-- ======================
-- RLS POLICIES FOR email_delivery_log
-- ======================

CREATE POLICY "Users can view own email logs"
  ON email_delivery_log FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "System can insert email logs"
  ON email_delivery_log FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Admins can update email logs"
  ON email_delivery_log FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can delete email logs"
  ON email_delivery_log FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

-- ======================
-- HELPER FUNCTIONS
-- ======================

-- Function to log email delivery attempt
CREATE OR REPLACE FUNCTION log_email_delivery(
  p_user_id uuid,
  p_email_type text,
  p_recipient_email text,
  p_subject text,
  p_status text DEFAULT 'pending',
  p_resend_message_id text DEFAULT NULL,
  p_template_data jsonb DEFAULT '{}'::jsonb,
  p_error_message text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_log_id uuid;
BEGIN
  INSERT INTO email_delivery_log (
    user_id,
    email_type,
    recipient_email,
    subject,
    status,
    resend_message_id,
    template_data,
    error_message,
    sent_at
  ) VALUES (
    p_user_id,
    p_email_type,
    p_recipient_email,
    p_subject,
    p_status,
    p_resend_message_id,
    p_template_data,
    p_error_message,
    CASE WHEN p_status = 'sent' THEN now() ELSE NULL END
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

-- Function to check if user should receive low balance alert
CREATE OR REPLACE FUNCTION should_send_low_balance_alert(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_billing_account record;
  v_user_prefs jsonb;
  v_last_alert timestamptz;
BEGIN
  -- Get billing account and user preferences
  SELECT ba.*, u.notification_preferences
  INTO v_billing_account
  FROM billing_accounts ba
  JOIN users u ON u.id = ba.user_id
  WHERE ba.user_id = p_user_id;

  v_user_prefs := v_billing_account.notification_preferences;

  -- Check if billing account exists
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Only send for Pay Per Use accounts
  IF v_billing_account.billing_plan != 'pay_per_use' THEN
    RETURN false;
  END IF;

  -- Check if user has low_balance_alerts enabled
  IF NOT (v_user_prefs->>'low_balance_alerts')::boolean THEN
    RETURN false;
  END IF;

  -- Check if wallet is below threshold
  IF v_billing_account.wallet_cents >= v_billing_account.low_balance_threshold_cents THEN
    RETURN false;
  END IF;

  -- Check if alert was sent within last 24 hours (prevent spam)
  v_last_alert := v_billing_account.last_low_balance_alert_at;
  IF v_last_alert IS NOT NULL AND v_last_alert > (now() - interval '24 hours') THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

-- Function to update last alert timestamp
CREATE OR REPLACE FUNCTION update_last_alert_timestamp(
  p_user_id uuid,
  p_alert_type text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  CASE p_alert_type
    WHEN 'low_balance' THEN
      UPDATE billing_accounts
      SET last_low_balance_alert_at = now()
      WHERE user_id = p_user_id;
    WHEN 'insufficient_balance' THEN
      UPDATE billing_accounts
      SET last_insufficient_balance_alert_at = now()
      WHERE user_id = p_user_id;
    WHEN 'service_interruption' THEN
      UPDATE billing_accounts
      SET last_interruption_warning_at = now()
      WHERE user_id = p_user_id;
    WHEN 'weekly_summary' THEN
      UPDATE billing_accounts
      SET last_weekly_summary_at = now()
      WHERE user_id = p_user_id;
  END CASE;
END;
$$;
