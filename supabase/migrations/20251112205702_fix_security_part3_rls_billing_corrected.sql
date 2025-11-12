/*
  # Fix Security Issues - Part 3: RLS Optimization for Billing Tables

  Optimize RLS policies to use (SELECT auth.uid()) pattern for better performance.
  
  Tables: transactions, wallet_transactions, billing_invoices, stripe tables
*/

-- =====================================================
-- TRANSACTIONS TABLE
-- =====================================================

DROP POLICY IF EXISTS "Users and admins can view transactions" ON transactions;
CREATE POLICY "Users and admins can view transactions"
  ON transactions FOR SELECT
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
-- WALLET_TRANSACTIONS TABLE
-- =====================================================

DROP POLICY IF EXISTS "Users can view own wallet transactions" ON wallet_transactions;
CREATE POLICY "Users can view own wallet transactions"
  ON wallet_transactions FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid()) OR
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = (SELECT auth.uid())
      AND users.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can insert wallet transactions" ON wallet_transactions;
CREATE POLICY "Admins can insert wallet transactions"
  ON wallet_transactions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = (SELECT auth.uid())
      AND users.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can update wallet transactions" ON wallet_transactions;
CREATE POLICY "Admins can update wallet transactions"
  ON wallet_transactions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = (SELECT auth.uid())
      AND users.role = 'admin'
    )
  );

-- =====================================================
-- BILLING_INVOICES TABLE
-- =====================================================

DROP POLICY IF EXISTS "Users can view own invoices" ON billing_invoices;
CREATE POLICY "Users can view own invoices"
  ON billing_invoices FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid()) OR
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = (SELECT auth.uid())
      AND users.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can manage invoices" ON billing_invoices;
CREATE POLICY "Admins can manage invoices"
  ON billing_invoices FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = (SELECT auth.uid())
      AND users.role = 'admin'
    )
  );

-- =====================================================
-- STRIPE_CUSTOMERS TABLE
-- =====================================================

DROP POLICY IF EXISTS "Users can view their own customer data" ON stripe_customers;
CREATE POLICY "Users can view their own customer data"
  ON stripe_customers FOR SELECT
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
-- STRIPE_SUBSCRIPTIONS TABLE (uses customer_id)
-- =====================================================

DROP POLICY IF EXISTS "Users can view their own subscription data" ON stripe_subscriptions;
CREATE POLICY "Users can view their own subscription data"
  ON stripe_subscriptions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM stripe_customers sc
      WHERE sc.customer_id = stripe_subscriptions.customer_id
      AND sc.user_id = (SELECT auth.uid())
    ) OR
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = (SELECT auth.uid())
      AND users.role = 'admin'
    )
  );

-- =====================================================
-- STRIPE_ORDERS TABLE (uses customer_id)
-- =====================================================

DROP POLICY IF EXISTS "Users can view their own order data" ON stripe_orders;
CREATE POLICY "Users can view their own order data"
  ON stripe_orders FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM stripe_customers sc
      WHERE sc.customer_id = stripe_orders.customer_id
      AND sc.user_id = (SELECT auth.uid())
    ) OR
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = (SELECT auth.uid())
      AND users.role = 'admin'
    )
  );