-- Ensure primary notification email trigger does not reference non-existent columns
CREATE OR REPLACE FUNCTION create_primary_notification_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  auth_email text;
BEGIN
  -- Fetch email from auth.users since public.users has no email column
  SELECT email INTO auth_email FROM auth.users WHERE id = NEW.id;

  INSERT INTO user_notification_emails (
    user_id,
    email,
    is_primary,
    low_balance_enabled,
    insufficient_balance_enabled,
    service_interruption_enabled,
    weekly_summary_enabled
  )
  VALUES (
    NEW.id,
    COALESCE(auth_email, ''),
    true,
    COALESCE(NEW.notification_preferences ->> 'low_balance_alerts', 'true')::boolean,
    COALESCE(NEW.notification_preferences ->> 'insufficient_balance_alerts', 'true')::boolean,
    COALESCE(NEW.notification_preferences ->> 'service_interruption_alerts', 'true')::boolean,
    COALESCE(NEW.notification_preferences ->> 'weekly_summaries', 'true')::boolean
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS create_primary_notification_email_trigger ON users;
CREATE TRIGGER create_primary_notification_email_trigger
  AFTER INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION create_primary_notification_email();
