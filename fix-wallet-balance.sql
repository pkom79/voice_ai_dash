-- Check current state for user 06a55047-02ef-430d-8897-786def2b5175
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)

-- 1. Check user record
SELECT * 
FROM users 
WHERE id = '06a55047-02ef-430d-8897-786def2b5175';

-- 2. Check billing account
SELECT user_id, wallet_cents, month_spent_cents, inbound_plan, inbound_rate_cents
FROM billing_accounts 
WHERE user_id = '06a55047-02ef-430d-8897-786def2b5175';

-- 3. Check all wallet transactions
SELECT 
  id,
  type,
  amount_cents,
  balance_before_cents,
  balance_after_cents,
  reason,
  created_at
FROM wallet_transactions 
WHERE user_id = '06a55047-02ef-430d-8897-786def2b5175'
ORDER BY created_at DESC;

-- 4. Calculate expected balance from transactions
SELECT 
  SUM(CASE WHEN type IN ('top_up', 'admin_credit', 'refund') THEN amount_cents ELSE 0 END) as total_credits,
  SUM(CASE WHEN type IN ('deduction', 'admin_debit') THEN amount_cents ELSE 0 END) as total_debits,
  SUM(CASE WHEN type IN ('top_up', 'admin_credit', 'refund') THEN amount_cents ELSE 0 END) - 
  SUM(CASE WHEN type IN ('deduction', 'admin_debit') THEN amount_cents ELSE 0 END) as expected_balance
FROM wallet_transactions 
WHERE user_id = '06a55047-02ef-430d-8897-786def2b5175';

-- 5. If the wallet_cents is wrong (showing 5000 instead of 513), fix it:
-- UPDATE billing_accounts 
-- SET wallet_cents = 513
-- WHERE user_id = '06a55047-02ef-430d-8897-786def2b5175';

-- 6. Check recent billing invoices
SELECT 
  id,
  subtotal_cents,
  wallet_applied_cents,
  total_charged_cents,
  status,
  billing_cycle_start,
  billing_cycle_end,
  created_at
FROM billing_invoices
WHERE user_id = '06a55047-02ef-430d-8897-786def2b5175'
ORDER BY created_at DESC
LIMIT 5;
