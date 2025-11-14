/*
  # Add Notification Alert Tracking

  1. New Columns
    - `billing_accounts.low_balance_threshold_cents` - Threshold for low balance alerts (default $10)
    - `billing_accounts.last_low_balance_alert_at` - Timestamp of last low balance alert
    - `billing_accounts.last_insufficient_balance_alert_at` - Timestamp of last insufficient balance alert
    - `billing_accounts.last_interruption_warning_at` - Timestamp of last service interruption warning
  
  2. New Functions
    - `update_last_alert_timestamp` - RPC function to update alert timestamps
  
  3. Security
    - Allow service role to update alert timestamps
*/

-- Add alert timestamp columns to billing_accounts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'billing_accounts' AND column_name = 'low_balance_threshold_cents'
  ) THEN
    ALTER TABLE billing_accounts ADD COLUMN low_balance_threshold_cents integer DEFAULT 1000 NOT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'billing_accounts' AND column_name = 'last_low_balance_alert_at'
  ) THEN
    ALTER TABLE billing_accounts ADD COLUMN last_low_balance_alert_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'billing_accounts' AND column_name = 'last_insufficient_balance_alert_at'
  ) THEN
    ALTER TABLE billing_accounts ADD COLUMN last_insufficient_balance_alert_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'billing_accounts' AND column_name = 'last_interruption_warning_at'
  ) THEN
    ALTER TABLE billing_accounts ADD COLUMN last_interruption_warning_at timestamptz;
  END IF;
END $$;

-- Create RPC function to update alert timestamps
CREATE OR REPLACE FUNCTION update_last_alert_timestamp(
  p_user_id uuid,
  p_alert_type text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    
    WHEN 'weekly_summary', 'daily_summary' THEN
      -- These don't update billing_accounts, just silently succeed
      NULL;
    
    ELSE
      RAISE EXCEPTION 'Invalid alert_type: %', p_alert_type;
  END CASE;
END;
$$;