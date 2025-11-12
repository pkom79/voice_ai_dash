/*
  # Fix Circular RLS Dependency on Users Table

  1. Problem
    - The `get_user_role()` function queries the `users` table
    - RLS policies on `users` table call `get_user_role()`
    - This creates infinite recursion causing 500 errors

  2. Solution
    - Drop the function and all dependent policies with CASCADE
    - Create a SECURITY DEFINER function that bypasses RLS
    - Recreate all policies

  3. Changes
    - Drop existing `get_user_role()` function with CASCADE
    - Create new `get_user_role()` function with SECURITY DEFINER
    - Recreate all RLS policies correctly
*/

-- Drop the existing function and all dependent policies
DROP FUNCTION IF EXISTS get_user_role() CASCADE;

-- Create a new SECURITY DEFINER function that bypasses RLS
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  user_role text;
BEGIN
  SELECT role INTO user_role
  FROM users
  WHERE id = auth.uid();
  
  RETURN user_role;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_user_role() TO authenticated;

-- Recreate users table policies
CREATE POLICY "Users can view own profile"
  ON users FOR SELECT
  TO authenticated
  USING (id = auth.uid() OR get_user_role() = 'admin');

CREATE POLICY "Users can insert own profile during signup"
  ON users FOR INSERT
  TO authenticated
  WITH CHECK ((id = auth.uid() AND role = 'client') OR get_user_role() = 'admin');

CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  TO authenticated
  USING (id = auth.uid() OR get_user_role() = 'admin')
  WITH CHECK ((id = auth.uid() AND role = (SELECT role FROM users WHERE id = auth.uid())) OR get_user_role() = 'admin');

CREATE POLICY "Admins can delete users"
  ON users FOR DELETE
  TO authenticated
  USING (get_user_role() = 'admin');

-- Recreate audit_logs policies
CREATE POLICY "Only admins can view audit logs"
  ON audit_logs FOR SELECT
  TO authenticated
  USING (get_user_role() = 'admin');

CREATE POLICY "Only admins can create audit logs"
  ON audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (get_user_role() = 'admin');

-- Recreate agents policies
CREATE POLICY "Users and admins can view agents"
  ON agents FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage agents"
  ON agents FOR ALL
  TO authenticated
  USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

-- Recreate phone_numbers policies
CREATE POLICY "Users and admins can view phone numbers"
  ON phone_numbers FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage phone numbers"
  ON phone_numbers FOR ALL
  TO authenticated
  USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

-- Recreate user_agents policies
CREATE POLICY "Users and admins can view agent assignments"
  ON user_agents FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR get_user_role() = 'admin');

CREATE POLICY "Admins can manage agent assignments"
  ON user_agents FOR ALL
  TO authenticated
  USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

-- Recreate user_phone_numbers policies
CREATE POLICY "Users and admins can view phone number assignments"
  ON user_phone_numbers FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR get_user_role() = 'admin');

CREATE POLICY "Admins can manage phone number assignments"
  ON user_phone_numbers FOR ALL
  TO authenticated
  USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

-- Recreate billing_accounts policies
CREATE POLICY "Users and admins can view billing accounts"
  ON billing_accounts FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR get_user_role() = 'admin');

CREATE POLICY "Users and admins can create billing accounts"
  ON billing_accounts FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() OR get_user_role() = 'admin');

CREATE POLICY "Admins can manage billing accounts"
  ON billing_accounts FOR ALL
  TO authenticated
  USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

-- Recreate transactions policies (transactions has user_id column)
CREATE POLICY "Users and admins can view transactions"
  ON transactions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR get_user_role() = 'admin');

CREATE POLICY "Admins can manage transactions"
  ON transactions FOR ALL
  TO authenticated
  USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

-- Recreate calls policies
CREATE POLICY "Users and admins can view calls"
  ON calls FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR get_user_role() = 'admin');

CREATE POLICY "Admins can manage all calls"
  ON calls FOR ALL
  TO authenticated
  USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

-- Recreate api_keys policies
CREATE POLICY "Admins can view and manage API keys"
  ON api_keys FOR ALL
  TO authenticated
  USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

-- Recreate sync_status policies
CREATE POLICY "Admins can manage sync status"
  ON sync_status FOR ALL
  TO authenticated
  USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

-- Recreate oauth_states policies
CREATE POLICY "Admins can manage oauth states"
  ON oauth_states FOR ALL
  TO authenticated
  USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

-- Recreate system_config policies  
CREATE POLICY "Admins can view and manage system config"
  ON system_config FOR ALL
  TO authenticated
  USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');
