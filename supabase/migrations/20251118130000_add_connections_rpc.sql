/*
  # Add Admin Connections Status RPC

  Adds a function to fetch user connection statuses for the Admin System page.
*/

CREATE OR REPLACE FUNCTION get_admin_connections_status()
RETURNS TABLE (
  user_id uuid,
  first_name text,
  last_name text,
  email varchar,
  connection_id uuid,
  is_active boolean,
  token_expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- Check if the caller is an admin
  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()
    AND role = 'admin'
    AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT 
    u.id,
    u.first_name,
    u.last_name,
    au.email::varchar,
    ak.id,
    ak.is_active,
    ak.token_expires_at
  FROM public.users u
  JOIN auth.users au ON u.id = au.id
  LEFT JOIN public.api_keys ak ON u.id = ak.user_id AND ak.service = 'highlevel'
  WHERE u.role != 'admin'
  ORDER BY u.first_name;
END;
$$;
