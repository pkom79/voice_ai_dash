-- Fix RPC functions for Admin System

-- 1. Fix get_admin_user_list to avoid ambiguous column references and ensure correct joins
CREATE OR REPLACE FUNCTION get_admin_user_list()
RETURNS TABLE (
  id uuid,
  first_name text,
  last_name text,
  email varchar
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- Check if the caller is an admin
  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT 
    u.id,
    u.first_name,
    u.last_name,
    au.email::varchar
  FROM public.users u
  JOIN auth.users au ON u.id = au.id
  ORDER BY u.first_name;
END;
$$;

-- 2. Fix get_admin_connections_status to join with auth.users for email
DROP FUNCTION IF EXISTS get_admin_connections_status();

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
SET search_path = public, auth
AS $$
BEGIN
  -- Check if the executing user is an admin
  IF NOT EXISTS (
    SELECT 1 FROM public.users 
    WHERE users.id = auth.uid() AND users.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT 
    u.id as user_id,
    u.first_name,
    u.last_name,
    au.email::text,
    u.business_name,
    (ak.access_token IS NOT NULL) as has_connection,
    CASE 
      WHEN ak.access_token IS NULL THEN 'missing'
      WHEN ak.token_expires_at < NOW() THEN 'expired'
      ELSE 'valid'
    END as token_status,
    ak.token_expires_at
  FROM public.users u
  JOIN auth.users au ON u.id = au.id
  LEFT JOIN public.api_keys ak ON u.id = ak.user_id AND ak.service = 'highlevel' AND ak.is_active = true
  WHERE u.role = 'client'
  ORDER BY u.created_at DESC;
END;
$$;
