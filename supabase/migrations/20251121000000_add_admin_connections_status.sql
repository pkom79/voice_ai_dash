-- Drop the function if it exists to avoid return type conflicts
DROP FUNCTION IF EXISTS get_admin_connections_status();

-- Create a function to get connection status for all users
CREATE OR REPLACE FUNCTION get_admin_connections_status()
RETURNS TABLE (
  user_id UUID,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  business_name TEXT,
  has_connection BOOLEAN,
  token_status TEXT, -- 'valid', 'expired', 'missing'
  token_expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if the executing user is an admin
  IF NOT EXISTS (
    SELECT 1 FROM users 
    WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT 
    u.id as user_id,
    u.first_name,
    u.last_name,
    u.email,
    u.business_name,
    (ak.access_token IS NOT NULL) as has_connection,
    CASE 
      WHEN ak.access_token IS NULL THEN 'missing'
      WHEN ak.token_expires_at < NOW() THEN 'expired'
      ELSE 'valid'
    END as token_status,
    ak.token_expires_at
  FROM users u
  LEFT JOIN api_keys ak ON u.id = ak.user_id AND ak.service = 'highlevel' AND ak.is_active = true
  WHERE u.role = 'client'
  ORDER BY u.created_at DESC;
END;
$$;
