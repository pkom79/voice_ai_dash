/*
  # Fix Security Issues - Part 2: RLS Optimization for Basic Tables

  Optimize RLS policies to use (SELECT auth.uid()) pattern for better performance.
  
  Tables covered:
  - users
  - user_agents  
  - user_phone_numbers
*/

-- =====================================================
-- USERS TABLE
-- =====================================================

DROP POLICY IF EXISTS "Users can view own profile" ON users;
CREATE POLICY "Users can view own profile"
  ON users FOR SELECT
  TO authenticated
  USING (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can insert own profile during signup" ON users;
CREATE POLICY "Users can insert own profile during signup"
  ON users FOR INSERT
  TO authenticated
  WITH CHECK (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can update own profile" ON users;
CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

-- =====================================================
-- USER_AGENTS TABLE
-- =====================================================

DROP POLICY IF EXISTS "Users and admins can view agent assignments" ON user_agents;
CREATE POLICY "Users and admins can view agent assignments"
  ON user_agents FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid()) OR
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = (SELECT auth.uid())
      AND users.role = 'admin'
    )
  );

-- =====================================================
-- USER_PHONE_NUMBERS TABLE
-- =====================================================

DROP POLICY IF EXISTS "Users and admins can view phone number assignments" ON user_phone_numbers;
CREATE POLICY "Users and admins can view phone number assignments"
  ON user_phone_numbers FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid()) OR
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = (SELECT auth.uid())
      AND users.role = 'admin'
    )
  );