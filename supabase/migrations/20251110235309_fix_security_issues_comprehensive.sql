/*
  # Comprehensive Security and Performance Fixes

  ## Overview
  This migration addresses critical security warnings and performance issues identified by Supabase's advisor.

  ## Changes Made

  ### 1. Add Missing Foreign Key Indexes
  Creates indexes for all foreign key columns that were missing covering indexes:
  - `api_keys.created_by` - Index for creator lookups
  - `audit_logs.target_user_id` - Index for audit log target user queries
  - `calls.phone_number_id` - Index for call phone number lookups
  - `oauth_states.admin_id` - Index for oauth state admin queries
  - `oauth_states.user_id` - Index for oauth state user queries
  - `user_agents.agent_id` - Index for reverse agent assignment lookups
  - `user_phone_numbers.phone_number_id` - Index for reverse phone number assignment lookups

  ### 2. Optimize RLS Policies with SELECT Subqueries
  Updates all RLS policies to use `(SELECT auth.uid())` and `(SELECT get_user_role())` instead of direct function calls.
  This prevents function re-evaluation for each row, significantly improving query performance at scale.

  Affected tables:
  - users
  - agents
  - phone_numbers
  - user_agents
  - user_phone_numbers
  - billing_accounts
  - transactions
  - calls
  - oauth_states
  - system_config

  ### 3. Fix Function Search Path Mutability
  Updates all functions to use immutable search_path settings to prevent security issues:
  - `update_updated_at_column()` - Trigger function for timestamp updates
  - `cleanup_expired_oauth_states()` - OAuth state cleanup function
  - `cleanup_expired_auth_codes()` - Authorization code cleanup function

  ### 4. Consolidate Duplicate Permissive Policies
  Combines multiple permissive policies into single policies using OR conditions where appropriate.
  This reduces policy overhead and simplifies security management.

  ## Security Notes
  - All indexes improve query performance without compromising security
  - RLS optimization maintains exact same security model with better performance
  - Function search path fixes prevent potential SQL injection via search_path manipulation
  - Policy consolidation maintains identical access control with reduced overhead
*/

-- ============================================================================
-- 1. ADD MISSING FOREIGN KEY INDEXES
-- ============================================================================

-- Index for api_keys.created_by foreign key
CREATE INDEX IF NOT EXISTS idx_api_keys_created_by ON api_keys(created_by);

-- Index for audit_logs.target_user_id foreign key
CREATE INDEX IF NOT EXISTS idx_audit_logs_target_user_id ON audit_logs(target_user_id);

-- Index for calls.phone_number_id foreign key
CREATE INDEX IF NOT EXISTS idx_calls_phone_number_id ON calls(phone_number_id);

-- Index for oauth_states.admin_id foreign key (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'oauth_states') THEN
    CREATE INDEX IF NOT EXISTS idx_oauth_states_admin_id ON oauth_states(admin_id);
    CREATE INDEX IF NOT EXISTS idx_oauth_states_user_id ON oauth_states(user_id);
  END IF;
END $$;

-- Index for user_agents.agent_id foreign key
CREATE INDEX IF NOT EXISTS idx_user_agents_agent_id ON user_agents(agent_id);

-- Index for user_phone_numbers.phone_number_id foreign key
CREATE INDEX IF NOT EXISTS idx_user_phone_numbers_phone_number_id ON user_phone_numbers(phone_number_id);

-- ============================================================================
-- 2. OPTIMIZE RLS POLICIES WITH SELECT SUBQUERIES
-- ============================================================================

-- Update get_user_role function to have immutable search path
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
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

-- Drop and recreate users table policies with optimized auth calls
DROP POLICY IF EXISTS "Users can view own profile" ON users;
DROP POLICY IF EXISTS "Users can insert own profile during signup" ON users;
DROP POLICY IF EXISTS "Users can update own profile" ON users;
DROP POLICY IF EXISTS "Admins can view all users" ON users;
DROP POLICY IF EXISTS "Admins can insert any user" ON users;
DROP POLICY IF EXISTS "Admins can update all users" ON users;
DROP POLICY IF EXISTS "Admins can delete users" ON users;

CREATE POLICY "Users can view own profile"
  ON users FOR SELECT
  TO authenticated
  USING (id = (SELECT auth.uid()) OR (SELECT get_user_role()) = 'admin');

CREATE POLICY "Users can insert own profile during signup"
  ON users FOR INSERT
  TO authenticated
  WITH CHECK (id = (SELECT auth.uid()) AND role = 'client' OR (SELECT get_user_role()) = 'admin');

CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  TO authenticated
  USING (id = (SELECT auth.uid()) OR (SELECT get_user_role()) = 'admin')
  WITH CHECK (id = (SELECT auth.uid()) AND role = (SELECT role FROM users WHERE id = (SELECT auth.uid())) OR (SELECT get_user_role()) = 'admin');

CREATE POLICY "Admins can delete users"
  ON users FOR DELETE
  TO authenticated
  USING ((SELECT get_user_role()) = 'admin');

-- Drop and recreate agents table policies
DROP POLICY IF EXISTS "Users can view assigned agents" ON agents;
DROP POLICY IF EXISTS "Admins can manage agents" ON agents;

CREATE POLICY "Users and admins can view agents"
  ON agents FOR SELECT
  TO authenticated
  USING (
    (SELECT get_user_role()) = 'admin'
    OR EXISTS (SELECT 1 FROM user_agents WHERE user_id = (SELECT auth.uid()) AND agent_id = agents.id)
  );

CREATE POLICY "Admins can manage agents"
  ON agents FOR ALL
  TO authenticated
  USING ((SELECT get_user_role()) = 'admin')
  WITH CHECK ((SELECT get_user_role()) = 'admin');

-- Drop and recreate phone_numbers table policies
DROP POLICY IF EXISTS "Users can view assigned phone numbers" ON phone_numbers;
DROP POLICY IF EXISTS "Admins can manage phone numbers" ON phone_numbers;

CREATE POLICY "Users and admins can view phone numbers"
  ON phone_numbers FOR SELECT
  TO authenticated
  USING (
    (SELECT get_user_role()) = 'admin'
    OR EXISTS (SELECT 1 FROM user_phone_numbers WHERE user_id = (SELECT auth.uid()) AND phone_number_id = phone_numbers.id)
  );

CREATE POLICY "Admins can manage phone numbers"
  ON phone_numbers FOR ALL
  TO authenticated
  USING ((SELECT get_user_role()) = 'admin')
  WITH CHECK ((SELECT get_user_role()) = 'admin');

-- Drop and recreate user_agents junction table policies
DROP POLICY IF EXISTS "Users can view own agent assignments" ON user_agents;
DROP POLICY IF EXISTS "Admins can manage agent assignments" ON user_agents;

CREATE POLICY "Users and admins can view agent assignments"
  ON user_agents FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR (SELECT get_user_role()) = 'admin'
  );

CREATE POLICY "Admins can manage agent assignments"
  ON user_agents FOR ALL
  TO authenticated
  USING ((SELECT get_user_role()) = 'admin')
  WITH CHECK ((SELECT get_user_role()) = 'admin');

-- Drop and recreate user_phone_numbers junction table policies
DROP POLICY IF EXISTS "Users can view own phone number assignments" ON user_phone_numbers;
DROP POLICY IF EXISTS "Admins can manage phone number assignments" ON user_phone_numbers;

CREATE POLICY "Users and admins can view phone number assignments"
  ON user_phone_numbers FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR (SELECT get_user_role()) = 'admin'
  );

CREATE POLICY "Admins can manage phone number assignments"
  ON user_phone_numbers FOR ALL
  TO authenticated
  USING ((SELECT get_user_role()) = 'admin')
  WITH CHECK ((SELECT get_user_role()) = 'admin');

-- Drop and recreate billing_accounts table policies
DROP POLICY IF EXISTS "Users can view own billing account" ON billing_accounts;
DROP POLICY IF EXISTS "Users can create own billing account" ON billing_accounts;
DROP POLICY IF EXISTS "Admins can manage billing accounts" ON billing_accounts;

CREATE POLICY "Users and admins can view billing accounts"
  ON billing_accounts FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR (SELECT get_user_role()) = 'admin'
  );

CREATE POLICY "Users and admins can create billing accounts"
  ON billing_accounts FOR INSERT
  TO authenticated
  WITH CHECK (
    (user_id = (SELECT auth.uid()) AND (SELECT get_user_role()) IN ('client', 'admin'))
    OR (SELECT get_user_role()) = 'admin'
  );

CREATE POLICY "Admins can manage billing accounts"
  ON billing_accounts FOR ALL
  TO authenticated
  USING ((SELECT get_user_role()) = 'admin')
  WITH CHECK ((SELECT get_user_role()) = 'admin');

-- Drop and recreate transactions table policies
DROP POLICY IF EXISTS "Users can view own transactions" ON transactions;
DROP POLICY IF EXISTS "Admins can manage transactions" ON transactions;

CREATE POLICY "Users and admins can view transactions"
  ON transactions FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR (SELECT get_user_role()) = 'admin'
  );

CREATE POLICY "Admins can manage transactions"
  ON transactions FOR ALL
  TO authenticated
  USING ((SELECT get_user_role()) = 'admin')
  WITH CHECK ((SELECT get_user_role()) = 'admin');

-- Drop and recreate calls table policies
DROP POLICY IF EXISTS "Users can view own calls" ON calls;
DROP POLICY IF EXISTS "Users can update own call notes" ON calls;
DROP POLICY IF EXISTS "Admins can manage all calls" ON calls;

CREATE POLICY "Users and admins can view calls"
  ON calls FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR (SELECT get_user_role()) = 'admin'
  );

CREATE POLICY "Users can update own call notes"
  ON calls FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Admins can manage all calls"
  ON calls FOR ALL
  TO authenticated
  USING ((SELECT get_user_role()) = 'admin')
  WITH CHECK ((SELECT get_user_role()) = 'admin');

-- Drop and recreate api_keys table policies
DROP POLICY IF EXISTS "Only admins can view API keys" ON api_keys;
DROP POLICY IF EXISTS "Only admins can manage API keys" ON api_keys;

CREATE POLICY "Admins can view and manage API keys"
  ON api_keys FOR ALL
  TO authenticated
  USING ((SELECT get_user_role()) = 'admin')
  WITH CHECK ((SELECT get_user_role()) = 'admin');

-- Drop and recreate sync_status table policies
DROP POLICY IF EXISTS "Authenticated users can view sync status" ON sync_status;
DROP POLICY IF EXISTS "Only admins can manage sync status" ON sync_status;

CREATE POLICY "Users can view sync status, admins can manage"
  ON sync_status FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage sync status"
  ON sync_status FOR ALL
  TO authenticated
  USING ((SELECT get_user_role()) = 'admin')
  WITH CHECK ((SELECT get_user_role()) = 'admin');

-- Update oauth_states policies if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'oauth_states') THEN
    DROP POLICY IF EXISTS "Only admins can view oauth states" ON oauth_states;
    DROP POLICY IF EXISTS "Only admins can create oauth states" ON oauth_states;
    DROP POLICY IF EXISTS "Only admins can delete oauth states" ON oauth_states;
    
    EXECUTE 'CREATE POLICY "Admins can manage oauth states"
      ON oauth_states FOR ALL
      TO authenticated
      USING ((SELECT get_user_role()) = ''admin'')
      WITH CHECK ((SELECT get_user_role()) = ''admin'')';
  END IF;
END $$;

-- Update system_config policies if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'system_config') THEN
    DROP POLICY IF EXISTS "Only admins can view system config" ON system_config;
    DROP POLICY IF EXISTS "Only admins can manage system config" ON system_config;
    
    EXECUTE 'CREATE POLICY "Admins can view and manage system config"
      ON system_config FOR ALL
      TO authenticated
      USING ((SELECT get_user_role()) = ''admin'')
      WITH CHECK ((SELECT get_user_role()) = ''admin'')';
  END IF;
END $$;

-- ============================================================================
-- 3. FIX FUNCTION SEARCH PATH MUTABILITY
-- ============================================================================

-- Update update_updated_at_column function with immutable search path
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Update cleanup_expired_oauth_states function if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'cleanup_expired_oauth_states') THEN
    EXECUTE 'CREATE OR REPLACE FUNCTION cleanup_expired_oauth_states()
      RETURNS void
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public, pg_temp
      AS $func$
      BEGIN
        DELETE FROM oauth_states WHERE expires_at < now();
      END;
      $func$';
  END IF;
END $$;

-- Update cleanup_expired_auth_codes function if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'cleanup_expired_auth_codes') THEN
    EXECUTE 'CREATE OR REPLACE FUNCTION cleanup_expired_auth_codes()
      RETURNS void
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public, pg_temp
      AS $func$
      BEGIN
        DELETE FROM oauth_authorization_codes WHERE expires_at < now();
      END;
      $func$';
  END IF;
END $$;
