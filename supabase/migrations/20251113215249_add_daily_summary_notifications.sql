/*
  # Add Daily Summary Notifications

  1. Changes
    - Add `daily_summary_enabled` column to `user_notification_emails` table
    - Set default value to `true` for existing records
    - Allow users to receive daily activity summaries via email
  
  2. Security
    - No RLS changes needed (inherits existing policies)
*/

-- Add daily_summary_enabled column to user_notification_emails
ALTER TABLE user_notification_emails 
ADD COLUMN IF NOT EXISTS daily_summary_enabled boolean DEFAULT true;

-- Set default to true for all existing records
UPDATE user_notification_emails 
SET daily_summary_enabled = true 
WHERE daily_summary_enabled IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN user_notification_emails.daily_summary_enabled IS 
'Enable/disable daily activity summary emails for this notification email address';