/*
  # Fix Security Issues - Part 4: RLS Optimization for Calls, Agents, Sync, Usage Tables

  Optimize RLS policies to use (SELECT auth.uid()) pattern for better performance.
  
  Tables: calls, agent_phone_numbers, sync_status, usage_logs, api_keys
*/

-- =====================================================
-- CALLS TABLE
-- =====================================================

DROP POLICY IF EXISTS "Users and admins can view calls" ON calls;
CREATE POLICY "Users and admins can view calls"
  ON calls FOR SELECT
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
-- AGENT_PHONE_NUMBERS TABLE
-- =====================================================

DROP POLICY IF EXISTS "Users can view assigned agent phone numbers" ON agent_phone_numbers;
CREATE POLICY "Users can view assigned agent phone numbers"
  ON agent_phone_numbers FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_agents ua
      WHERE ua.agent_id = agent_phone_numbers.agent_id
      AND ua.user_id = (SELECT auth.uid())
    ) OR
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = (SELECT auth.uid())
      AND users.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Users can insert agent phone numbers for assigned agents" ON agent_phone_numbers;
CREATE POLICY "Users can insert agent phone numbers for assigned agents"
  ON agent_phone_numbers FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_agents ua
      WHERE ua.agent_id = agent_phone_numbers.agent_id
      AND ua.user_id = (SELECT auth.uid())
    ) OR
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = (SELECT auth.uid())
      AND users.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can update agent phone numbers" ON agent_phone_numbers;
CREATE POLICY "Admins can update agent phone numbers"
  ON agent_phone_numbers FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = (SELECT auth.uid())
      AND users.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can delete agent phone numbers" ON agent_phone_numbers;
CREATE POLICY "Admins can delete agent phone numbers"
  ON agent_phone_numbers FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = (SELECT auth.uid())
      AND users.role = 'admin'
    )
  );

-- =====================================================
-- SYNC_STATUS TABLE
-- =====================================================

DROP POLICY IF EXISTS "Users can view own and global sync status" ON sync_status;
DROP POLICY IF EXISTS "Authenticated users can view sync status" ON sync_status;
CREATE POLICY "Users can view sync status"
  ON sync_status FOR SELECT
  TO authenticated
  USING (
    user_id IS NULL OR
    user_id = (SELECT auth.uid()) OR
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = (SELECT auth.uid())
      AND users.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Users can insert own sync status" ON sync_status;
DROP POLICY IF EXISTS "Authenticated users can insert sync status" ON sync_status;
CREATE POLICY "Users can insert sync status"
  ON sync_status FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id IS NULL OR
    user_id = (SELECT auth.uid()) OR
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = (SELECT auth.uid())
      AND users.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Users can update own sync status" ON sync_status;
DROP POLICY IF EXISTS "Authenticated users can update sync status" ON sync_status;
CREATE POLICY "Users can update sync status"
  ON sync_status FOR UPDATE
  TO authenticated
  USING (
    user_id IS NULL OR
    user_id = (SELECT auth.uid()) OR
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = (SELECT auth.uid())
      AND users.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can delete sync status" ON sync_status;
CREATE POLICY "Admins can delete sync status"
  ON sync_status FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = (SELECT auth.uid())
      AND users.role = 'admin'
    )
  );

-- =====================================================
-- USAGE_LOGS TABLE
-- =====================================================

DROP POLICY IF EXISTS "Users can view own usage logs" ON usage_logs;
CREATE POLICY "Users can view own usage logs"
  ON usage_logs FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid()) OR
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = (SELECT auth.uid())
      AND users.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can insert usage logs" ON usage_logs;
CREATE POLICY "Admins can insert usage logs"
  ON usage_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = (SELECT auth.uid())
      AND users.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can update usage logs" ON usage_logs;
CREATE POLICY "Admins can update usage logs"
  ON usage_logs FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = (SELECT auth.uid())
      AND users.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can delete usage logs" ON usage_logs;
CREATE POLICY "Admins can delete usage logs"
  ON usage_logs FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = (SELECT auth.uid())
      AND users.role = 'admin'
    )
  );

-- =====================================================
-- API_KEYS TABLE
-- =====================================================

DROP POLICY IF EXISTS "Users can view own API keys" ON api_keys;
CREATE POLICY "Users can view own API keys"
  ON api_keys FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid()) OR
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = (SELECT auth.uid())
      AND users.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can manage all API keys" ON api_keys;
CREATE POLICY "Admins can manage all API keys"
  ON api_keys FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = (SELECT auth.uid())
      AND users.role = 'admin'
    )
  );