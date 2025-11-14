/*
  # Create admin_notifications table

  ## Overview
  Tracks admin email notifications sent about system events like expired tokens.
  Prevents duplicate notifications and provides audit trail.

  ## Tables Created

  ### admin_notifications
  - `id` (uuid, primary key)
  - `notification_type` (text) - Type of notification (e.g., 'token_expired', 'low_balance')
  - `user_id` (uuid, nullable) - Related user if applicable
  - `recipient_email` (text) - Admin email that received notification
  - `subject` (text) - Email subject line
  - `sent_at` (timestamptz) - When notification was sent
  - `metadata` (jsonb) - Additional context data
  - `created_at` (timestamptz)

  ## Security
  - RLS enabled
  - Admin-only access for reading notifications
  - System can insert notifications (for edge functions)

  ## Indexes
  - Index on notification_type and user_id for deduplication checks
  - Index on sent_at for recent notification queries
*/

-- Create admin_notifications table
CREATE TABLE IF NOT EXISTS admin_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_type text NOT NULL,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  recipient_email text NOT NULL,
  subject text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Add comments
COMMENT ON TABLE admin_notifications IS 'Tracks admin notifications sent about system events';
COMMENT ON COLUMN admin_notifications.notification_type IS 'Type of notification: token_expired, low_balance, etc.';
COMMENT ON COLUMN admin_notifications.user_id IS 'Related user if notification is user-specific';
COMMENT ON COLUMN admin_notifications.recipient_email IS 'Admin email address that received the notification';
COMMENT ON COLUMN admin_notifications.metadata IS 'Additional context data for the notification';

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_admin_notifications_type_user
  ON admin_notifications(notification_type, user_id);

CREATE INDEX IF NOT EXISTS idx_admin_notifications_sent_at
  ON admin_notifications(sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_notifications_user_id
  ON admin_notifications(user_id) WHERE user_id IS NOT NULL;

-- Enable RLS
ALTER TABLE admin_notifications ENABLE ROW LEVEL SECURITY;

-- Policy: Admins can read all notifications
CREATE POLICY "Admins can read all notifications"
  ON admin_notifications
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- Policy: System (service role) can insert notifications
CREATE POLICY "System can insert notifications"
  ON admin_notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Grant necessary permissions
GRANT SELECT ON admin_notifications TO authenticated;
GRANT INSERT ON admin_notifications TO authenticated;
