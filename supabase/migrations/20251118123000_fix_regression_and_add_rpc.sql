/*
  # Fix Critical Regression and Add Admin User List RPC

  1. Revert is_admin() and users RLS policy to previous working state (using auth.uid()).
  2. Add get_admin_user_list() RPC to safely fetch users with emails for the admin dropdown.
*/

-- Revert is_admin to use auth.uid() and remove search_path restriction that broke it
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role = 'admin'
    AND is_active = true
  );
$$;

-- Revert policy to use auth.uid()
DROP POLICY IF EXISTS "Users can view own profile or admins can view all" ON users;

CREATE POLICY "Users can view own profile or admins can view all"
  ON users
  FOR SELECT
  TO authenticated
  USING (
    id = auth.uid() OR is_admin()
  );

-- Create RPC function for fetching users with emails (bypassing RLS for admins)
-- This fixes the "Select User" dropdown being empty because it was trying to select 'email' column which doesn't exist on users table
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
    au.email::varchar
  FROM public.users u
  JOIN auth.users au ON u.id = au.id
  ORDER BY u.first_name;
END;
$$;
