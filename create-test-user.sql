-- Create a test user for manual billing testing
-- Run this in Supabase SQL Editor

-- 1. Create test user in auth.users
INSERT INTO auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  aud,
  role
)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'test-billing@voiceaidash.test',
  crypt('TestBilling123!', gen_salt('bf')),
  NOW(),
  NOW(),
  NOW(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"first_name":"Test","last_name":"User"}'::jsonb,
  'authenticated',
  'authenticated'
)
ON CONFLICT (id) DO NOTHING;

-- 2. Insert into users table
INSERT INTO users (id, first_name, last_name, role, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Test',
  'User',
  'client',
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- 3. Create billing account with test balance
INSERT INTO billing_accounts (
  user_id,
  inbound_plan,
  inbound_rate_cents,
  outbound_plan,
  outbound_rate_cents,
  wallet_cents,
  month_spent_cents,
  month_added_cents
)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'inbound_pay_per_use',
  100,
  NULL,
  0,
  10000,  -- $100.00 test balance
  0,
  0
)
ON CONFLICT (user_id) DO UPDATE SET
  wallet_cents = 10000;

-- 4. Log initial wallet credit
SELECT log_wallet_transaction(
  '00000000-0000-0000-0000-000000000001'::uuid,
  'admin_credit',
  10000,
  0,
  10000,
  'Test account initial credit',
  NULL,
  NULL,
  '{"test": true}'::jsonb
);

-- 5. Insert some test calls for manual billing
INSERT INTO calls (
  user_id,
  highlevel_call_id,
  direction,
  from_number,
  to_number,
  call_started_at,
  call_ended_at,
  duration_seconds,
  cost,
  status
)
VALUES 
  -- Call 1: 5 minutes at $1/min = $5
  (
    '00000000-0000-0000-0000-000000000001',
    'test-call-001',
    'inbound',
    '+15551234567',
    '+15559876543',
    '2025-11-15 10:00:00+00',
    '2025-11-15 10:05:00+00',
    300,
    5.00,
    'completed'
  ),
  -- Call 2: 3 minutes at $1/min = $3
  (
    '00000000-0000-0000-0000-000000000001',
    'test-call-002',
    'inbound',
    '+15551234567',
    '+15559876543',
    '2025-11-20 14:30:00+00',
    '2025-11-20 14:33:00+00',
    180,
    3.00,
    'completed'
  ),
  -- Call 3: 2 minutes at $1/min = $2
  (
    '00000000-0000-0000-0000-000000000001',
    'test-call-003',
    'inbound',
    '+15551234567',
    '+15559876543',
    '2025-11-25 16:00:00+00',
    '2025-11-25 16:02:00+00',
    120,
    2.00,
    'completed'
  )
ON CONFLICT (highlevel_call_id) DO NOTHING;

-- 6. Verify test data
SELECT 'Users Table' as check_step;
SELECT * FROM users WHERE id = '00000000-0000-0000-0000-000000000001';

SELECT 'Billing Account' as check_step;
SELECT user_id, wallet_cents, inbound_plan, inbound_rate_cents 
FROM billing_accounts 
WHERE user_id = '00000000-0000-0000-0000-000000000001';

SELECT 'Wallet Transactions' as check_step;
SELECT type, amount_cents, reason, created_at
FROM wallet_transactions
WHERE user_id = '00000000-0000-0000-0000-000000000001';

SELECT 'Test Calls' as check_step;
SELECT highlevel_call_id, call_started_at, duration_seconds, cost
FROM calls 
WHERE user_id = '00000000-0000-0000-0000-000000000001'
ORDER BY call_started_at;

-- Expected result after manual billing for Nov 15-25:
-- Starting wallet: $100.00
-- Usage: $5 + $3 + $2 = $10.00
-- Wallet after deduction: $90.00
-- Amount charged to Stripe: $0.00 (covered by wallet)

-- Cleanup (run this after testing):
-- DELETE FROM calls WHERE user_id = '00000000-0000-0000-0000-000000000001';
-- DELETE FROM wallet_transactions WHERE user_id = '00000000-0000-0000-0000-000000000001';
-- DELETE FROM billing_invoices WHERE user_id = '00000000-0000-0000-0000-000000000001';
-- DELETE FROM billing_accounts WHERE user_id = '00000000-0000-0000-0000-000000000001';
-- DELETE FROM users WHERE id = '00000000-0000-0000-0000-000000000001';
-- DELETE FROM auth.users WHERE id = '00000000-0000-0000-0000-000000000001';
