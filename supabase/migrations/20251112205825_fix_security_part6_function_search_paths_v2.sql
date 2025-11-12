/*
  # Fix Security Issues - Part 6: Fix Function Search Paths

  Fix mutable search_path issues on database functions by setting
  search_path = public, pg_temp explicitly.
  
  Functions affected:
  - log_wallet_transaction
  - reset_monthly_billing_tracking
  - reset_monthly_added_tracking
  - unassign_user_phone_numbers
  - process_past_due_accounts
*/

-- =====================================================
-- LOG_WALLET_TRANSACTION
-- =====================================================

DROP FUNCTION IF EXISTS log_wallet_transaction();

CREATE FUNCTION log_wallet_transaction()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public, pg_temp
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO audit_logs (
    user_id,
    action,
    details,
    ip_address
  ) VALUES (
    NEW.user_id,
    'wallet_transaction_' || lower(NEW.type),
    jsonb_build_object(
      'transaction_id', NEW.id,
      'amount', NEW.amount_cents,
      'type', NEW.type,
      'reason', NEW.reason
    ),
    inet_client_addr()
  );
  RETURN NEW;
END;
$$;

-- =====================================================
-- RESET_MONTHLY_BILLING_TRACKING
-- =====================================================

DROP FUNCTION IF EXISTS reset_monthly_billing_tracking();

CREATE FUNCTION reset_monthly_billing_tracking()
RETURNS void
SECURITY DEFINER
SET search_path = public, pg_temp
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE billing_accounts
  SET 
    month_spent_cents = 0,
    updated_at = NOW();
END;
$$;

-- =====================================================
-- RESET_MONTHLY_ADDED_TRACKING
-- =====================================================

DROP FUNCTION IF EXISTS reset_monthly_added_tracking();

CREATE FUNCTION reset_monthly_added_tracking()
RETURNS void
SECURITY DEFINER
SET search_path = public, pg_temp
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE billing_accounts
  SET month_added_cents = 0;
END;
$$;

-- =====================================================
-- UNASSIGN_USER_PHONE_NUMBERS
-- =====================================================

DROP FUNCTION IF EXISTS unassign_user_phone_numbers(UUID);

CREATE FUNCTION unassign_user_phone_numbers(p_user_id UUID)
RETURNS void
SECURITY DEFINER
SET search_path = public, pg_temp
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM user_phone_numbers
  WHERE user_id = p_user_id;
END;
$$;

-- =====================================================
-- PROCESS_PAST_DUE_ACCOUNTS
-- =====================================================

DROP FUNCTION IF EXISTS process_past_due_accounts();

CREATE FUNCTION process_past_due_accounts()
RETURNS void
SECURITY DEFINER
SET search_path = public, pg_temp
LANGUAGE plpgsql
AS $$
DECLARE
  v_account RECORD;
BEGIN
  FOR v_account IN
    SELECT 
      ba.user_id,
      ba.wallet_cents,
      ba.grace_until,
      u.first_name,
      u.last_name,
      ba.subscription_status
    FROM billing_accounts ba
    JOIN users u ON ba.user_id = u.id
    WHERE ba.subscription_status = 'past_due'
      AND ba.grace_until < NOW()
      AND u.is_active = true
  LOOP
    UPDATE users
    SET is_active = false
    WHERE id = v_account.user_id;

    UPDATE billing_accounts
    SET subscription_status = 'suspended'
    WHERE user_id = v_account.user_id;

    INSERT INTO audit_logs (
      user_id,
      action,
      details
    ) VALUES (
      v_account.user_id,
      'account_suspended',
      jsonb_build_object(
        'reason', 'past_due_grace_period_expired',
        'grace_until', v_account.grace_until,
        'balance_cents', v_account.wallet_cents
      )
    );
  END LOOP;
END;
$$;