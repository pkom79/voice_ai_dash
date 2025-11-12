/*
  # Apply Stripe-Backed Billing System with Dynamic Inline Pricing

  ## Overview
  This migration was created in the codebase but never applied to the database.
  Applying it now to bring the database schema up to date with the code (v2.0.0).

  ## Changes to Existing Tables

  ### billing_accounts
  - Add `billing_plan` enum: 'pay_per_use' | 'unlimited' | 'complimentary'
  - Add `rate_per_minute_cents` integer (stores rate in cents, e.g., 500 = $0.05/min)
  - Add `wallet_cents` integer (replaces wallet_balance decimal)
  - Add `month_spent_cents` integer (current billing cycle spending)
  - Add `month_added_cents` integer (credits added this calendar month)
  - Add `next_payment_at` timestamptz (next scheduled payment date)
  - Add `grace_until` timestamptz (payment failure grace period expiry)
  - Add `stripe_subscription_id` text (Stripe subscription reference)
  - Migrate existing data from wallet_balance to wallet_cents
  - Deprecate old columns (keep for backward compatibility)

  ## New Tables

  ### 1. usage_logs
  - Tracks per-call usage with rate at time of call
  - Per-call billing tracking with historical rate preservation

  ### 2. wallet_transactions
  - Audit trail for all wallet credit changes
  - Replaces old `transactions` table functionality with cents-based amounts

  ### 3. billing_invoices
  - Historical record of all invoices
  - Monthly billing cycle tracking

  ## Security
  - Enable RLS on all new tables
  - Users can view their own usage and wallet transactions
  - Admins have full access to all billing data

  ## Indexes
  - Optimized for billing calculations and lookups
  - User-based filtering for fast queries
  - Date range queries for billing cycles
*/

-- ======================
-- MODIFY EXISTING TABLE
-- ======================

-- Add new columns to billing_accounts
ALTER TABLE billing_accounts
  ADD COLUMN IF NOT EXISTS billing_plan text DEFAULT 'pay_per_use' CHECK (billing_plan IN ('pay_per_use', 'unlimited', 'complimentary')),
  ADD COLUMN IF NOT EXISTS rate_per_minute_cents integer DEFAULT 500,
  ADD COLUMN IF NOT EXISTS wallet_cents integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS month_spent_cents integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS month_added_cents integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_payment_at timestamptz,
  ADD COLUMN IF NOT EXISTS grace_until timestamptz,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text;

-- Migrate existing data from decimal to cents (only if wallet_cents is 0)
UPDATE billing_accounts
SET wallet_cents = ROUND(COALESCE(wallet_balance, 0) * 100)::integer
WHERE wallet_cents = 0;

-- Add comments to deprecated columns
COMMENT ON COLUMN billing_accounts.payment_model IS 'DEPRECATED: Use billing_plan instead';
COMMENT ON COLUMN billing_accounts.wallet_balance IS 'DEPRECATED: Use wallet_cents instead';
COMMENT ON COLUMN billing_accounts.monthly_fee IS 'DEPRECATED: Flat fee stored in Stripe';

-- ======================
-- CREATE NEW TABLES
-- ======================

-- Create usage_logs table
CREATE TABLE IF NOT EXISTS usage_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  call_id uuid REFERENCES calls(id) ON DELETE SET NULL,
  seconds_used integer NOT NULL DEFAULT 0,
  rate_at_time_cents integer NOT NULL,
  cost_cents integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Create wallet_transactions table
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('top_up', 'deduction', 'admin_credit', 'admin_debit', 'refund')),
  amount_cents integer NOT NULL,
  balance_before_cents integer NOT NULL,
  balance_after_cents integer NOT NULL,
  reason text NOT NULL,
  admin_id uuid REFERENCES users(id) ON DELETE SET NULL,
  stripe_payment_id text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Create billing_invoices table
CREATE TABLE IF NOT EXISTS billing_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  billing_cycle_start timestamptz NOT NULL,
  billing_cycle_end timestamptz NOT NULL,
  subtotal_cents integer NOT NULL DEFAULT 0,
  wallet_applied_cents integer NOT NULL DEFAULT 0,
  total_charged_cents integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'finalized', 'paid', 'failed', 'cancelled')),
  stripe_invoice_id text,
  stripe_invoice_url text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ======================
-- CREATE INDEXES
-- ======================

-- usage_logs indexes
CREATE INDEX IF NOT EXISTS idx_usage_logs_user_id ON usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_call_id ON usage_logs(call_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_created_at ON usage_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_usage_logs_user_date ON usage_logs(user_id, created_at);

-- wallet_transactions indexes
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user_id ON wallet_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_type ON wallet_transactions(type);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_created_at ON wallet_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_admin_id ON wallet_transactions(admin_id);

-- billing_invoices indexes
CREATE INDEX IF NOT EXISTS idx_billing_invoices_user_id ON billing_invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_status ON billing_invoices(status);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_cycle_start ON billing_invoices(billing_cycle_start);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_stripe_invoice_id ON billing_invoices(stripe_invoice_id);

-- billing_accounts additional indexes
CREATE INDEX IF NOT EXISTS idx_billing_accounts_billing_plan ON billing_accounts(billing_plan);
CREATE INDEX IF NOT EXISTS idx_billing_accounts_next_payment_at ON billing_accounts(next_payment_at);
CREATE INDEX IF NOT EXISTS idx_billing_accounts_grace_until ON billing_accounts(grace_until);

-- ======================
-- ENABLE ROW LEVEL SECURITY
-- ======================

ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_invoices ENABLE ROW LEVEL SECURITY;

-- ======================
-- RLS POLICIES FOR usage_logs
-- ======================

CREATE POLICY "Users can view own usage logs"
  ON usage_logs FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can insert usage logs"
  ON usage_logs FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can update usage logs"
  ON usage_logs FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can delete usage logs"
  ON usage_logs FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

-- ======================
-- RLS POLICIES FOR wallet_transactions
-- ======================

CREATE POLICY "Users can view own wallet transactions"
  ON wallet_transactions FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can insert wallet transactions"
  ON wallet_transactions FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can update wallet transactions"
  ON wallet_transactions FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

-- ======================
-- RLS POLICIES FOR billing_invoices
-- ======================

CREATE POLICY "Users can view own invoices"
  ON billing_invoices FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can manage invoices"
  ON billing_invoices FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

-- ======================
-- CREATE TRIGGERS
-- ======================

-- Trigger for billing_invoices updated_at
CREATE TRIGGER update_billing_invoices_updated_at
  BEFORE UPDATE ON billing_invoices
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ======================
-- HELPER FUNCTIONS
-- ======================

-- Function to log wallet transaction
CREATE OR REPLACE FUNCTION log_wallet_transaction(
  p_user_id uuid,
  p_type text,
  p_amount_cents integer,
  p_balance_before_cents integer,
  p_balance_after_cents integer,
  p_reason text,
  p_admin_id uuid DEFAULT NULL,
  p_stripe_payment_id text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_transaction_id uuid;
BEGIN
  INSERT INTO wallet_transactions (
    user_id,
    type,
    amount_cents,
    balance_before_cents,
    balance_after_cents,
    reason,
    admin_id,
    stripe_payment_id,
    metadata
  ) VALUES (
    p_user_id,
    p_type,
    p_amount_cents,
    p_balance_before_cents,
    p_balance_after_cents,
    p_reason,
    p_admin_id,
    p_stripe_payment_id,
    p_metadata
  )
  RETURNING id INTO v_transaction_id;

  RETURN v_transaction_id;
END;
$$;

-- Function to reset monthly billing tracking on billing cycle
CREATE OR REPLACE FUNCTION reset_monthly_billing_tracking(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE billing_accounts
  SET month_spent_cents = 0
  WHERE user_id = p_user_id;
END;
$$;

-- Function to reset monthly added tracking on calendar month change
CREATE OR REPLACE FUNCTION reset_monthly_added_tracking(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE billing_accounts
  SET month_added_cents = 0
  WHERE user_id = p_user_id;
END;
$$;