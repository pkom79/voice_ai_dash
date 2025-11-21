-- Seed primary admin notification emails for admins missing a notification record
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
  false, -- client-only alerts
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
