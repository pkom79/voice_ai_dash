CREATE OR REPLACE FUNCTION get_recent_refresh_failures(hours_ago integer DEFAULT 24)
RETURNS TABLE (
  user_id uuid,
  user_email text,
  user_name text,
  error_message text,
  failed_at timestamptz,
  failure_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    trl.user_id,
    au.email::text,
    (u.first_name || ' ' || u.last_name)::text as user_name,
    trl.error_message,
    trl.created_at AS failed_at,
    COUNT(*) OVER (PARTITION BY trl.user_id) AS failure_count
  FROM token_refresh_logs trl
  JOIN auth.users au ON au.id = trl.user_id
  JOIN users u ON u.id = trl.user_id
  WHERE
    trl.refresh_status = 'failure'
    AND trl.created_at >= (now() - (hours_ago || ' hours')::interval)
  ORDER BY trl.created_at DESC;
END;
$$;
