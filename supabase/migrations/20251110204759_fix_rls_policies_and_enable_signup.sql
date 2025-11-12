/*
  # Fix RLS Policies and Enable User Signup

  ## Changes Made

  ### 1. Security Function
  - Creates `get_user_role()` function with SECURITY DEFINER to safely check user roles without RLS recursion
  - Function bypasses RLS to query the users table
  - Returns the role ('client' or 'admin') or null for the current authenticated user

  ### 2. Fixed Users Table Policies
  - Drops all existing problematic policies on users table
  - Creates new policies using the security definer function
  - Adds INSERT policy to allow authenticated users to create their own profile during signup
  - Ensures users can only insert rows with their own auth.uid() and role must be 'client'

  ### 3. Fixed All Table Policies
  - Updates policies on all tables that check for admin role
  - Replaces recursive queries with the new get_user_role() function
  - Applies fixes to: agents, phone_numbers, user_agents, user_phone_numbers, billing_accounts, transactions, calls, api_keys, sync_status, audit_logs

  ## Security Notes
  - New users can only create profiles with 'client' role during signup
  - Only existing admins can create or promote users to 'admin' role
  - All admin checks now use the safe get_user_role() function
  - RLS remains enabled and restrictive on all tables
*/

-- Create security definer function to safely get user role
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

-- Drop existing problematic policies on users table
DROP POLICY IF EXISTS "Users can view own profile" ON users;
DROP POLICY IF EXISTS "Users can update own profile" ON users;
DROP POLICY IF EXISTS "Admins can view all users" ON users;
DROP POLICY IF EXISTS "Admins can insert users" ON users;
DROP POLICY IF EXISTS "Admins can update all users" ON users;
DROP POLICY IF EXISTS "Admins can delete users" ON users;

-- Create new fixed policies for users table
CREATE POLICY "Users can view own profile"
  ON users FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Admins can view all users"
  ON users FOR SELECT
  TO authenticated
  USING (get_user_role() = 'admin');

CREATE POLICY "Users can insert own profile during signup"
  ON users FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid() AND role = 'client');

CREATE POLICY "Admins can insert any user"
  ON users FOR INSERT
  TO authenticated
  WITH CHECK (get_user_role() = 'admin');

CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid() AND role = (SELECT role FROM users WHERE id = auth.uid()));

CREATE POLICY "Admins can update all users"
  ON users FOR UPDATE
  TO authenticated
  USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

CREATE POLICY "Admins can delete users"
  ON users FOR DELETE
  TO authenticated
  USING (get_user_role() = 'admin');

-- Fix agents table policies
DROP POLICY IF EXISTS "Users can view assigned agents" ON agents;
DROP POLICY IF EXISTS "Admins can manage agents" ON agents;

CREATE POLICY "Users can view assigned agents"
  ON agents FOR SELECT
  TO authenticated
  USING (
    get_user_role() = 'admin'
    OR EXISTS (SELECT 1 FROM user_agents WHERE user_id = auth.uid() AND agent_id = agents.id)
  );

CREATE POLICY "Admins can manage agents"
  ON agents FOR ALL
  TO authenticated
  USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

-- Fix phone_numbers table policies
DROP POLICY IF EXISTS "Users can view assigned phone numbers" ON phone_numbers;
DROP POLICY IF EXISTS "Admins can manage phone numbers" ON phone_numbers;

CREATE POLICY "Users can view assigned phone numbers"
  ON phone_numbers FOR SELECT
  TO authenticated
  USING (
    get_user_role() = 'admin'
    OR EXISTS (SELECT 1 FROM user_phone_numbers WHERE user_id = auth.uid() AND phone_number_id = phone_numbers.id)
  );

CREATE POLICY "Admins can manage phone numbers"
  ON phone_numbers FOR ALL
  TO authenticated
  USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

-- Fix user_agents junction table policies
DROP POLICY IF EXISTS "Users can view own agent assignments" ON user_agents;
DROP POLICY IF EXISTS "Admins can manage agent assignments" ON user_agents;

CREATE POLICY "Users can view own agent assignments"
  ON user_agents FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR get_user_role() = 'admin'
  );

CREATE POLICY "Admins can manage agent assignments"
  ON user_agents FOR ALL
  TO authenticated
  USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

-- Fix user_phone_numbers junction table policies
DROP POLICY IF EXISTS "Users can view own phone number assignments" ON user_phone_numbers;
DROP POLICY IF EXISTS "Admins can manage phone number assignments" ON user_phone_numbers;

CREATE POLICY "Users can view own phone number assignments"
  ON user_phone_numbers FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR get_user_role() = 'admin'
  );

CREATE POLICY "Admins can manage phone number assignments"
  ON user_phone_numbers FOR ALL
  TO authenticated
  USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

-- Fix billing_accounts table policies
DROP POLICY IF EXISTS "Users can view own billing account" ON billing_accounts;
DROP POLICY IF EXISTS "Admins can manage billing accounts" ON billing_accounts;

CREATE POLICY "Users can view own billing account"
  ON billing_accounts FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR get_user_role() = 'admin'
  );

CREATE POLICY "Admins can manage billing accounts"
  ON billing_accounts FOR ALL
  TO authenticated
  USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

-- Fix transactions table policies
DROP POLICY IF EXISTS "Users can view own transactions" ON transactions;
DROP POLICY IF EXISTS "Admins can manage transactions" ON transactions;

CREATE POLICY "Users can view own transactions"
  ON transactions FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR get_user_role() = 'admin'
  );

CREATE POLICY "Admins can manage transactions"
  ON transactions FOR ALL
  TO authenticated
  USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

-- Fix calls table policies
DROP POLICY IF EXISTS "Users can view own calls" ON calls;
DROP POLICY IF EXISTS "Users can update own call notes" ON calls;
DROP POLICY IF EXISTS "Admins can manage all calls" ON calls;

CREATE POLICY "Users can view own calls"
  ON calls FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR get_user_role() = 'admin'
  );

CREATE POLICY "Users can update own call notes"
  ON calls FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can manage all calls"
  ON calls FOR ALL
  TO authenticated
  USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

-- Fix api_keys table policies
DROP POLICY IF EXISTS "Only admins can view API keys" ON api_keys;
DROP POLICY IF EXISTS "Only admins can manage API keys" ON api_keys;

CREATE POLICY "Only admins can view API keys"
  ON api_keys FOR SELECT
  TO authenticated
  USING (get_user_role() = 'admin');

CREATE POLICY "Only admins can manage API keys"
  ON api_keys FOR ALL
  TO authenticated
  USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

-- Fix sync_status table policies
DROP POLICY IF EXISTS "Only admins can manage sync status" ON sync_status;

CREATE POLICY "Only admins can manage sync status"
  ON sync_status FOR ALL
  TO authenticated
  USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

-- Fix audit_logs table policies
DROP POLICY IF EXISTS "Only admins can view audit logs" ON audit_logs;
DROP POLICY IF EXISTS "Only admins can create audit logs" ON audit_logs;

CREATE POLICY "Only admins can view audit logs"
  ON audit_logs FOR SELECT
  TO authenticated
  USING (get_user_role() = 'admin');

CREATE POLICY "Only admins can create audit logs"
  ON audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (get_user_role() = 'admin');