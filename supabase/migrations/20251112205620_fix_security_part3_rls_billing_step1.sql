/*
  # Fix Security Issues - Part 3: RLS Optimization for Billing Tables (Step 1)

  Optimize RLS policies to use (SELECT auth.uid()) pattern for better performance.
  
  Testing billing_accounts table first.
*/

-- =====================================================
-- BILLING_ACCOUNTS TABLE
-- =====================================================

DROP POLICY IF EXISTS "Users and admins can view billing accounts" ON billing_accounts;
CREATE POLICY "Users and admins can view billing accounts"
  ON billing_accounts FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid()) OR
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = (SELECT auth.uid())
      AND users.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Users and admins can create billing accounts" ON billing_accounts;
CREATE POLICY "Users and admins can create billing accounts"
  ON billing_accounts FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid()) OR
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = (SELECT auth.uid())
      AND users.role = 'admin'
    )
  );