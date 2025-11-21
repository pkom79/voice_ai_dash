-- Add admin notification preference flags to user_notification_emails
ALTER TABLE user_notification_emails
  ADD COLUMN IF NOT EXISTS admin_user_accepted_invite boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS admin_token_expired boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS admin_hl_disconnected boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS admin_payment_failed boolean NOT NULL DEFAULT false;

-- Default admins to receive these notifications; clients remain false
UPDATE user_notification_emails une
SET
  admin_user_accepted_invite = true,
  admin_token_expired = true,
  admin_hl_disconnected = true,
  admin_payment_failed = true
FROM users u
WHERE une.user_id = u.id
  AND u.role = 'admin';

-- Ensure future admin inserts default to on while keeping clients off
CREATE OR REPLACE FUNCTION set_admin_notification_defaults()
RETURNS trigger AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id AND role = 'admin') THEN
    NEW.admin_user_accepted_invite := COALESCE(NEW.admin_user_accepted_invite, true);
    NEW.admin_token_expired := COALESCE(NEW.admin_token_expired, true);
    NEW.admin_hl_disconnected := COALESCE(NEW.admin_hl_disconnected, true);
    NEW.admin_payment_failed := COALESCE(NEW.admin_payment_failed, true);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_notification_admin_defaults ON user_notification_emails;
CREATE TRIGGER trg_user_notification_admin_defaults
BEFORE INSERT ON user_notification_emails
FOR EACH ROW
EXECUTE FUNCTION set_admin_notification_defaults();
