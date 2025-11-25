-- Fix admin notification email creation and ensure admins always have proper notification records

-- Update the create_primary_notification_email function to include admin notification columns
CREATE OR REPLACE FUNCTION create_primary_notification_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  auth_email text;
  is_admin boolean;
BEGIN
  -- Fetch email from auth.users since public.users has no email column
  SELECT email INTO auth_email FROM auth.users WHERE id = NEW.id;
  
  -- Check if this user is an admin
  is_admin := (NEW.role = 'admin');

  INSERT INTO user_notification_emails (
    user_id,
    email,
    is_primary,
    low_balance_enabled,
    insufficient_balance_enabled,
    service_interruption_enabled,
    weekly_summary_enabled,
    daily_summary_enabled,
    admin_user_accepted_invite,
    admin_token_expired,
    admin_hl_disconnected,
    admin_payment_failed
  )
  VALUES (
    NEW.id,
    COALESCE(auth_email, ''),
    true,
    -- Client notification defaults
    COALESCE(NEW.notification_preferences ->> 'low_balance_alerts', 'true')::boolean,
    COALESCE(NEW.notification_preferences ->> 'insufficient_balance_alerts', 'true')::boolean,
    COALESCE(NEW.notification_preferences ->> 'service_interruption_alerts', 'true')::boolean,
    COALESCE(NEW.notification_preferences ->> 'weekly_summaries', 'true')::boolean,
    COALESCE(NEW.notification_preferences ->> 'daily_summaries', 'false')::boolean,
    -- Admin notification defaults (true if admin, false otherwise)
    is_admin,
    is_admin,
    is_admin,
    is_admin
  );

  RETURN NEW;
END;
$$;

-- Create a trigger to update notification email flags when a user's role changes to admin
CREATE OR REPLACE FUNCTION update_admin_notification_flags_on_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If user is being promoted to admin
  IF NEW.role = 'admin' AND (OLD.role IS NULL OR OLD.role != 'admin') THEN
    -- Ensure they have a notification email record with admin flags enabled
    INSERT INTO user_notification_emails (
      user_id,
      email,
      is_primary,
      admin_user_accepted_invite,
      admin_token_expired,
      admin_hl_disconnected,
      admin_payment_failed
    )
    SELECT
      NEW.id,
      au.email,
      true,
      true,
      true,
      true,
      true
    FROM auth.users au
    WHERE au.id = NEW.id
    ON CONFLICT (user_id, email) DO UPDATE SET
      admin_user_accepted_invite = true,
      admin_token_expired = true,
      admin_hl_disconnected = true,
      admin_payment_failed = true;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_admin_notification_on_role_change ON users;
CREATE TRIGGER update_admin_notification_on_role_change
  AFTER UPDATE OF role ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_admin_notification_flags_on_role_change();

-- Backfill: Ensure all current admins have proper notification email records
-- First, update existing records to enable admin flags
UPDATE user_notification_emails une
SET
  admin_user_accepted_invite = true,
  admin_token_expired = true,
  admin_hl_disconnected = true,
  admin_payment_failed = true
FROM users u
WHERE une.user_id = u.id
  AND u.role = 'admin'
  AND u.is_active = true;

-- Then, insert missing records for admins who don't have any notification email
INSERT INTO user_notification_emails (
  user_id,
  email,
  is_primary,
  low_balance_enabled,
  insufficient_balance_enabled,
  service_interruption_enabled,
  weekly_summary_enabled,
  daily_summary_enabled,
  admin_user_accepted_invite,
  admin_token_expired,
  admin_hl_disconnected,
  admin_payment_failed
)
SELECT
  u.id,
  au.email,
  true,
  false, -- client-only alerts disabled for admins
  false,
  false,
  false,
  false,
  true,  -- admin alerts enabled by default
  true,
  true,
  true
FROM users u
JOIN auth.users au ON au.id = u.id
WHERE u.role = 'admin'
  AND u.is_active = true
  AND au.email IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM user_notification_emails une
    WHERE une.user_id = u.id
  );
