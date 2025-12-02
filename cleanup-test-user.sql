-- Cleanup test user data
-- Run this in Supabase SQL Editor to remove all test data

-- Delete in reverse order of dependencies
DELETE FROM calls WHERE user_id = '00000000-0000-0000-0000-000000000001';
DELETE FROM wallet_transactions WHERE user_id = '00000000-0000-0000-0000-000000000001';
DELETE FROM billing_invoices WHERE user_id = '00000000-0000-0000-0000-000000000001';
DELETE FROM billing_accounts WHERE user_id = '00000000-0000-0000-0000-000000000001';
DELETE FROM users WHERE id = '00000000-0000-0000-0000-000000000001';
DELETE FROM auth.users WHERE id = '00000000-0000-0000-0000-000000000001';

-- Verify cleanup
SELECT 'Remaining test data' as check;
SELECT COUNT(*) as calls FROM calls WHERE user_id = '00000000-0000-0000-0000-000000000001';
SELECT COUNT(*) as transactions FROM wallet_transactions WHERE user_id = '00000000-0000-0000-0000-000000000001';
SELECT COUNT(*) as invoices FROM billing_invoices WHERE user_id = '00000000-0000-0000-0000-000000000001';
SELECT COUNT(*) as billing FROM billing_accounts WHERE user_id = '00000000-0000-0000-0000-000000000001';
SELECT COUNT(*) as users FROM users WHERE id = '00000000-0000-0000-0000-000000000001';
SELECT COUNT(*) as auth_users FROM auth.users WHERE id = '00000000-0000-0000-0000-000000000001';
