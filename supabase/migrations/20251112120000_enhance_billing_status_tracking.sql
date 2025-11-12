/*
  # Enhance Billing Status Tracking and Automated Number Unassignment

  ## Overview
  This migration enhances the billing system with improved subscription status tracking
  and adds functionality for automated number unassignment for past due accounts.

  ## Changes to Existing Tables

  ### billing_accounts
  - Add `subscription_status` text field to track Stripe subscription status
  - Add index on `grace_until` for efficient past due queries
  - Add index on `subscription_status` for status-based queries

  ## New Functions

  ### unassign_user_phone_numbers
  - Unassigns all phone numbers from a user's agents
  - Clears inbound_phone_number and highlevel_number_pool_id fields
  - Removes entries from agent_phone_numbers junction table
  - Logs actions in audit_logs
  - Returns count of agents affected

  ## Security
  - Function uses SECURITY DEFINER for elevated permissions
  - Audit logging ensures accountability
  - Only callable by admin users or automated systems

  ## Use Cases
  - Automated number unassignment for accounts 10 days past due
  - Manual intervention by admins for policy enforcement
  - Service suspension workflows
*/

-- Add subscription_status column to billing_accounts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'billing_accounts' AND column_name = 'subscription_status'
  ) THEN
    ALTER TABLE billing_accounts ADD COLUMN subscription_status text;
  END IF;
END $$;

-- Add indexes for billing status queries
CREATE INDEX IF NOT EXISTS idx_billing_accounts_grace_until ON billing_accounts(grace_until) WHERE grace_until IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_billing_accounts_subscription_status ON billing_accounts(subscription_status) WHERE subscription_status IS NOT NULL;

-- Create compound index for past due accounts
CREATE INDEX IF NOT EXISTS idx_billing_accounts_past_due_check
  ON billing_accounts(billing_plan, grace_until)
  WHERE billing_plan = 'unlimited' AND grace_until IS NOT NULL;

-- Function to unassign all phone numbers from a user's agents
CREATE OR REPLACE FUNCTION unassign_user_phone_numbers(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_agent_count integer := 0;
  v_phone_count integer := 0;
  v_deleted_count integer;
  v_agent record;
BEGIN
  -- Loop through all agents for this user
  FOR v_agent IN
    SELECT a.id, a.highlevel_agent_id
    FROM agents a
    INNER JOIN user_agents ua ON ua.agent_id = a.id
    WHERE ua.user_id = p_user_id
  LOOP
    v_agent_count := v_agent_count + 1;

    -- Clear phone number fields from agent
    UPDATE agents
    SET
      inbound_phone_number = NULL,
      highlevel_number_pool_id = NULL,
      updated_at = now()
    WHERE id = v_agent.id;

    -- Remove all phone number assignments from junction table
    DELETE FROM agent_phone_numbers
    WHERE agent_id = v_agent.id;

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    v_phone_count := v_phone_count + v_deleted_count;
  END LOOP;

  -- Log the action in audit_logs
  INSERT INTO audit_logs (
    action,
    target_user_id,
    details
  ) VALUES (
    'automated_number_unassignment',
    p_user_id,
    jsonb_build_object(
      'agents_affected', v_agent_count,
      'phone_assignments_removed', v_phone_count,
      'reason', 'Past due payment - automated service suspension',
      'timestamp', now()
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'agents_affected', v_agent_count,
    'phone_assignments_removed', v_phone_count,
    'user_id', p_user_id
  );
END;
$$;

-- Function to identify and process past due accounts (10+ days)
CREATE OR REPLACE FUNCTION process_past_due_accounts()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cutoff_date timestamptz;
  v_account record;
  v_processed_count integer := 0;
  v_results jsonb := '[]'::jsonb;
  v_unassign_result jsonb;
BEGIN
  -- Calculate cutoff date (current time minus 10 days)
  v_cutoff_date := now() - interval '10 days';

  -- Find all unlimited plan accounts that are past the grace period by 10+ days
  FOR v_account IN
    SELECT
      ba.user_id,
      ba.grace_until,
      ba.subscription_status,
      u.first_name,
      u.last_name,
      u.business_name
    FROM billing_accounts ba
    INNER JOIN users u ON u.id = ba.user_id
    WHERE ba.billing_plan = 'unlimited'
      AND ba.grace_until IS NOT NULL
      AND ba.grace_until < v_cutoff_date
      AND u.is_active = true
  LOOP
    -- Unassign phone numbers for this user
    v_unassign_result := unassign_user_phone_numbers(v_account.user_id);

    v_processed_count := v_processed_count + 1;

    -- Build result object
    v_results := v_results || jsonb_build_object(
      'user_id', v_account.user_id,
      'user_name', COALESCE(v_account.business_name, v_account.first_name || ' ' || v_account.last_name),
      'grace_until', v_account.grace_until,
      'days_past_due', EXTRACT(DAY FROM (now() - v_account.grace_until)),
      'unassignment_result', v_unassign_result
    );
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'processed_count', v_processed_count,
    'cutoff_date', v_cutoff_date,
    'accounts', v_results
  );
END;
$$;

-- Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION unassign_user_phone_numbers(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION process_past_due_accounts() TO service_role;

-- Add helpful comments
COMMENT ON FUNCTION unassign_user_phone_numbers(uuid) IS 'Unassigns all phone numbers from a user''s agents. Used for service suspension due to non-payment.';
COMMENT ON FUNCTION process_past_due_accounts() IS 'Identifies and processes accounts that are 10+ days past due by unassigning phone numbers. Should be run daily via cron job.';
COMMENT ON COLUMN billing_accounts.subscription_status IS 'Stripe subscription status: active, past_due, canceled, unpaid, etc.';
COMMENT ON COLUMN billing_accounts.grace_until IS 'End of grace period after payment failure. After this date + 10 days, phone numbers are automatically unassigned.';
