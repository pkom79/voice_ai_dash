/*
  # Fix Security Issues - Part 5: Consolidate Duplicate Permissive Policies

  Consolidate multiple permissive policies into single, well-defined policies.
  
  Tables affected:
  - agents
  - api_keys (already done)
  - billing_accounts
  - billing_invoices (already done)
  - calls
  - sync_status (already done)
  - transactions
  - user_agents
  - user_phone_numbers
*/

-- =====================================================
-- AGENTS TABLE - Consolidate permissive policies
-- =====================================================

DROP POLICY IF EXISTS "Users and admins can view agents" ON agents;
DROP POLICY IF EXISTS "Admins can manage agents" ON agents;

CREATE POLICY "Users can view assigned agents"
  ON agents FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_agents ua
      WHERE ua.agent_id = agents.id
      AND ua.user_id = (SELECT auth.uid())
    ) OR
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = (SELECT auth.uid())
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Admins can manage agents"
  ON agents FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = (SELECT auth.uid())
      AND users.role = 'admin'
    )
  );

-- =====================================================
-- USER_AGENTS TABLE - Consolidate
-- =====================================================

DROP POLICY IF EXISTS "Admins can manage agent assignments" ON user_agents;

CREATE POLICY "Admins can manage agent assignments"
  ON user_agents FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = (SELECT auth.uid())
      AND users.role = 'admin'
    )
  );

-- =====================================================
-- USER_PHONE_NUMBERS TABLE - Consolidate
-- =====================================================

DROP POLICY IF EXISTS "Admins can manage phone number assignments" ON user_phone_numbers;

CREATE POLICY "Admins can manage phone number assignments"
  ON user_phone_numbers FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = (SELECT auth.uid())
      AND users.role = 'admin'
    )
  );

-- =====================================================
-- BILLING_ACCOUNTS - Consolidate
-- =====================================================

DROP POLICY IF EXISTS "Admins can manage billing accounts" ON billing_accounts;

CREATE POLICY "Admins can manage billing accounts"
  ON billing_accounts FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = (SELECT auth.uid())
      AND users.role = 'admin'
    )
  );

-- =====================================================
-- CALLS TABLE - Consolidate
-- =====================================================

DROP POLICY IF EXISTS "Admins can manage all calls" ON calls;
DROP POLICY IF EXISTS "Users can update own call notes" ON calls;

CREATE POLICY "Admins can manage all calls"
  ON calls FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = (SELECT auth.uid())
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Users can update own call notes"
  ON calls FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- =====================================================
-- TRANSACTIONS TABLE - Consolidate
-- =====================================================

DROP POLICY IF EXISTS "Admins can manage transactions" ON transactions;

CREATE POLICY "Admins can manage transactions"
  ON transactions FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = (SELECT auth.uid())
      AND users.role = 'admin'
    )
  );