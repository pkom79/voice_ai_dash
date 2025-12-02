-- Check auth.users
SELECT id, email, created_at FROM auth.users WHERE id = '06a55047-02ef-430d-8897-786def2b5175';

-- Check users table
SELECT * FROM users WHERE id = '06a55047-02ef-430d-8897-786def2b5175';

-- Check billing_accounts
SELECT * FROM billing_accounts WHERE user_id = '06a55047-02ef-430d-8897-786def2b5175';

-- Check wallet_transactions
SELECT * FROM wallet_transactions WHERE user_id = '06a55047-02ef-430d-8897-786def2b5175' ORDER BY created_at DESC;
