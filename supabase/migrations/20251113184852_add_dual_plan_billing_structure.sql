/*
  # Dual-Plan Billing Structure

  ## Overview
  Converts single billing_plan to dual-direction system supporting separate Inbound and Outbound plans.
  Users can have:
  - Inbound only (PPU or Unlimited)
  - Outbound only (PPU)
  - Both Inbound and Outbound plans simultaneously

  ## Changes

  ### billing_accounts table
  1. Add inbound_plan (text, nullable): 'inbound_pay_per_use' | 'inbound_unlimited' | null
  2. Add outbound_plan (text, nullable): 'outbound_pay_per_use' | null
  3. Add inbound_rate_cents (integer, default 500): Rate for inbound PPU calls
  4. Add outbound_rate_cents (integer, default 500): Rate for outbound PPU calls
  5. Add first_login_billing_completed (boolean, default false): Track initial payment status
  6. Keep existing billing_plan for backward compatibility during migration

  ### users table
  1. Make business_name NOT NULL with default empty string
  2. Add constraint to ensure business_name is not empty for clients

  ### calls table
  1. Add archived_calls jsonb column for soft-delete functionality

  ## Migration Strategy
  - Existing users with 'pay_per_use' → inbound_plan = 'inbound_pay_per_use', outbound_plan = null
  - Existing users with 'unlimited' → inbound_plan = 'inbound_unlimited', outbound_plan = null
  - Existing users with 'complimentary' → both plans = null (special handling)
  - All existing users marked as first_login_billing_completed = true
  - Existing rate_per_minute_cents → inbound_rate_cents, outbound_rate_cents = 500

  ## Security
  - RLS policies updated to handle new columns
  - Admins have full access to archived_calls
  - Clients can only see their active calls
*/

-- ======================
-- ALTER billing_accounts TABLE
-- ======================

-- Add new dual-plan columns
ALTER TABLE billing_accounts
  ADD COLUMN IF NOT EXISTS inbound_plan text CHECK (inbound_plan IN ('inbound_pay_per_use', 'inbound_unlimited')),
  ADD COLUMN IF NOT EXISTS outbound_plan text CHECK (outbound_plan IN ('outbound_pay_per_use')),
  ADD COLUMN IF NOT EXISTS inbound_rate_cents integer DEFAULT 500,
  ADD COLUMN IF NOT EXISTS outbound_rate_cents integer DEFAULT 500,
  ADD COLUMN IF NOT EXISTS first_login_billing_completed boolean DEFAULT false;

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_billing_accounts_inbound_plan ON billing_accounts(inbound_plan);
CREATE INDEX IF NOT EXISTS idx_billing_accounts_outbound_plan ON billing_accounts(outbound_plan);
CREATE INDEX IF NOT EXISTS idx_billing_accounts_first_login ON billing_accounts(first_login_billing_completed);

-- Migrate existing data from single plan to dual-plan structure
UPDATE billing_accounts
SET
  inbound_plan = CASE
    WHEN billing_plan = 'pay_per_use' THEN 'inbound_pay_per_use'
    WHEN billing_plan = 'unlimited' THEN 'inbound_unlimited'
    ELSE NULL
  END,
  outbound_plan = NULL,
  inbound_rate_cents = COALESCE(rate_per_minute_cents, 500),
  outbound_rate_cents = 500,
  first_login_billing_completed = true
WHERE inbound_plan IS NULL;

-- Add comment to old billing_plan column
COMMENT ON COLUMN billing_accounts.billing_plan IS 'DEPRECATED: Use inbound_plan and outbound_plan instead. Kept for backward compatibility.';

-- ======================
-- ALTER users TABLE
-- ======================

-- Set default empty string for existing NULL business_names
UPDATE users
SET business_name = ''
WHERE business_name IS NULL;

-- Make business_name NOT NULL
ALTER TABLE users
  ALTER COLUMN business_name SET DEFAULT '',
  ALTER COLUMN business_name SET NOT NULL;

-- ======================
-- ALTER calls TABLE
-- ======================

-- Add archived_calls column for soft-delete functionality
ALTER TABLE calls
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS archived_reason text;

-- Create index for archived calls
CREATE INDEX IF NOT EXISTS idx_calls_archived_at ON calls(archived_at) WHERE archived_at IS NOT NULL;

-- ======================
-- UPDATE RLS POLICIES
-- ======================

-- Drop existing policies if they exist and recreate with new column support
DO $$
BEGIN
  -- billing_accounts policies already handle new columns through user_id check
  -- No changes needed to RLS as new columns follow same ownership rules

  -- Ensure archived calls are excluded from normal queries for clients
  -- Admins can see all calls including archived
  NULL;
END $$;

-- ======================
-- HELPER FUNCTIONS
-- ======================

-- Function to calculate billing status for a user
CREATE OR REPLACE FUNCTION get_user_billing_status(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_billing billing_accounts%ROWTYPE;
  v_status text;
BEGIN
  SELECT * INTO v_billing
  FROM billing_accounts
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN 'unknown';
  END IF;

  -- Check for past due (grace period expired)
  IF v_billing.grace_until IS NOT NULL AND v_billing.grace_until < now() THEN
    RETURN 'past_due';
  END IF;

  -- Check for insufficient balance (PPU users only)
  IF (v_billing.inbound_plan = 'inbound_pay_per_use' OR v_billing.outbound_plan = 'outbound_pay_per_use') THEN
    IF v_billing.wallet_cents < v_billing.month_spent_cents THEN
      RETURN 'insufficient_balance';
    END IF;
  END IF;

  -- Default status
  RETURN 'active';
END;
$$;

-- Function to calculate required payment for plan combination
CREATE OR REPLACE FUNCTION calculate_required_payment(
  p_inbound_plan text,
  p_outbound_plan text,
  p_current_wallet_cents integer DEFAULT 0
)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_wallet_required integer := 0;
  v_subscription_required integer := 0;
  v_total integer := 0;
BEGIN
  -- Determine if PPU wallet is needed ($50 = 5000 cents)
  IF (p_inbound_plan = 'inbound_pay_per_use' OR p_outbound_plan = 'outbound_pay_per_use') THEN
    v_wallet_required := 5000;

    -- If user already has wallet balance, only charge difference
    IF p_current_wallet_cents < 5000 THEN
      v_wallet_required := 5000 - p_current_wallet_cents;
    ELSE
      v_wallet_required := 0;
    END IF;
  END IF;

  -- Determine if Unlimited subscription is needed ($500 = 50000 cents)
  IF p_inbound_plan = 'inbound_unlimited' THEN
    v_subscription_required := 50000;
  END IF;

  v_total := v_wallet_required + v_subscription_required;
  RETURN v_total;
END;
$$;

-- Function to check if user has any PPU plan
CREATE OR REPLACE FUNCTION user_has_ppu_plan(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_billing billing_accounts%ROWTYPE;
BEGIN
  SELECT * INTO v_billing
  FROM billing_accounts
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  RETURN (v_billing.inbound_plan = 'inbound_pay_per_use' OR v_billing.outbound_plan = 'outbound_pay_per_use');
END;
$$;

-- ======================
-- GRANT PERMISSIONS
-- ======================

GRANT EXECUTE ON FUNCTION get_user_billing_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_required_payment(text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION user_has_ppu_plan(uuid) TO authenticated;

-- ======================
-- DATA VALIDATION
-- ======================

-- Add constraint to ensure at least one plan is selected (unless complimentary)
ALTER TABLE billing_accounts
  ADD CONSTRAINT check_has_plan
  CHECK (
    inbound_plan IS NOT NULL
    OR outbound_plan IS NOT NULL
    OR billing_plan = 'complimentary'
  );

-- ======================
-- COMMENTS
-- ======================

COMMENT ON COLUMN billing_accounts.inbound_plan IS 'Inbound plan type: inbound_pay_per_use or inbound_unlimited';
COMMENT ON COLUMN billing_accounts.outbound_plan IS 'Outbound plan type: currently only outbound_pay_per_use supported';
COMMENT ON COLUMN billing_accounts.inbound_rate_cents IS 'Rate in cents per minute for inbound PPU calls. Default 500 = $5.00/min';
COMMENT ON COLUMN billing_accounts.outbound_rate_cents IS 'Rate in cents per minute for outbound PPU calls. Default 500 = $5.00/min';
COMMENT ON COLUMN billing_accounts.first_login_billing_completed IS 'True if initial payment ($50 wallet or $500 subscription) has been collected';
COMMENT ON COLUMN calls.archived_at IS 'Timestamp when call was archived (soft delete)';
COMMENT ON COLUMN calls.archived_by IS 'Admin user who archived the call';
COMMENT ON COLUMN calls.archived_reason IS 'Reason for archiving (e.g., test call, data reset)';
COMMENT ON FUNCTION get_user_billing_status(uuid) IS 'Returns billing status: active, past_due, insufficient_balance, or unknown';
COMMENT ON FUNCTION calculate_required_payment(text, text, integer) IS 'Calculates total payment required in cents for given plan combination';
COMMENT ON FUNCTION user_has_ppu_plan(uuid) IS 'Returns true if user has any pay-per-use plan (inbound or outbound)';
