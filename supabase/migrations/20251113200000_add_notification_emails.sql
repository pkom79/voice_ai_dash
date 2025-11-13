/*
  # Add Notification Emails System

  1. New Tables
    - `user_notification_emails`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to users)
      - `email` (text, email address)
      - `is_primary` (boolean, one primary per user)
      - `low_balance_enabled` (boolean)
      - `insufficient_balance_enabled` (boolean)
      - `service_interruption_enabled` (boolean)
      - `weekly_summary_enabled` (boolean)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `user_notification_emails` table
    - Add policies for user access and admin access

  3. Notes
    - Users can have multiple notification email addresses
    - Each email can have individual notification preferences
    - One email must be marked as primary (defaults to user's auth email)
*/

-- Create the user_notification_emails table
CREATE TABLE IF NOT EXISTS user_notification_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  low_balance_enabled boolean NOT NULL DEFAULT true,
  insufficient_balance_enabled boolean NOT NULL DEFAULT true,
  service_interruption_enabled boolean NOT NULL DEFAULT true,
  weekly_summary_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  CONSTRAINT valid_email CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- Create index for faster user queries
CREATE INDEX IF NOT EXISTS idx_notification_emails_user_id ON user_notification_emails(user_id);

-- Create unique index to ensure only one primary email per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_emails_primary
  ON user_notification_emails(user_id)
  WHERE is_primary = true;

-- Enable RLS
ALTER TABLE user_notification_emails ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own notification emails
CREATE POLICY "Users can view own notification emails"
  ON user_notification_emails
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own notification emails
CREATE POLICY "Users can insert own notification emails"
  ON user_notification_emails
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own notification emails
CREATE POLICY "Users can update own notification emails"
  ON user_notification_emails
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own notification emails (except primary)
CREATE POLICY "Users can delete own notification emails"
  ON user_notification_emails
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id AND is_primary = false);

-- Policy: Admins can view all notification emails
CREATE POLICY "Admins can view all notification emails"
  ON user_notification_emails
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- Policy: Admins can manage all notification emails
CREATE POLICY "Admins can manage all notification emails"
  ON user_notification_emails
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- Function to automatically create primary notification email when user is created
CREATE OR REPLACE FUNCTION create_primary_notification_email()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Insert primary notification email with user's auth email
  INSERT INTO user_notification_emails (
    user_id,
    email,
    is_primary,
    low_balance_enabled,
    insufficient_balance_enabled,
    service_interruption_enabled,
    weekly_summary_enabled
  ) VALUES (
    NEW.id,
    NEW.email,
    true,
    COALESCE(NEW.notification_low_balance_enabled, true),
    COALESCE(NEW.notification_insufficient_balance_enabled, true),
    COALESCE(NEW.notification_service_interruption_enabled, true),
    COALESCE(NEW.notification_weekly_summary_enabled, true)
  );

  RETURN NEW;
END;
$$;

-- Trigger to create primary notification email for new users
DROP TRIGGER IF EXISTS create_primary_notification_email_trigger ON users;
CREATE TRIGGER create_primary_notification_email_trigger
  AFTER INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION create_primary_notification_email();

-- Migrate existing users to have primary notification emails
DO $$
DECLARE
  user_record RECORD;
BEGIN
  FOR user_record IN
    SELECT id, email,
           notification_low_balance_enabled,
           notification_insufficient_balance_enabled,
           notification_service_interruption_enabled,
           notification_weekly_summary_enabled
    FROM users
    WHERE id NOT IN (SELECT user_id FROM user_notification_emails WHERE is_primary = true)
  LOOP
    INSERT INTO user_notification_emails (
      user_id,
      email,
      is_primary,
      low_balance_enabled,
      insufficient_balance_enabled,
      service_interruption_enabled,
      weekly_summary_enabled
    ) VALUES (
      user_record.id,
      user_record.email,
      true,
      COALESCE(user_record.notification_low_balance_enabled, true),
      COALESCE(user_record.notification_insufficient_balance_enabled, true),
      COALESCE(user_record.notification_service_interruption_enabled, true),
      COALESCE(user_record.notification_weekly_summary_enabled, true)
    );
  END LOOP;
END $$;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_notification_email_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Trigger to update updated_at on notification emails
DROP TRIGGER IF EXISTS update_notification_email_timestamp ON user_notification_emails;
CREATE TRIGGER update_notification_email_timestamp
  BEFORE UPDATE ON user_notification_emails
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_email_updated_at();
