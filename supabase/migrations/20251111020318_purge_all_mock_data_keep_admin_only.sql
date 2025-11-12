/*
  # Purge All Mock Data - Keep Admin Only

  ## Overview
  Complete removal of all mock and test data from the database, preserving only the admin user.
  This migration ensures a clean production-ready database state.

  ## Current State (Before Migration)
  - Users: 4 (admin@voiceai.test, client@voiceai.test, 2x test users)
  - Calls: 22 records
  - Transactions: 6 records
  - Agents: 5 records
  - Phone Numbers: 6 records
  - User-Agent Assignments: 5 records
  - API Keys: 1 record
  - Billing Accounts: 2 records
  - OAuth States: 17 records
  - Sync Status: 1 record

  ## After Migration
  - Users: 1 (admin@voiceai.test only)
  - All other tables: Empty (no data)
  - Admin billing account: Preserved with zero balance

  ## Data Removal Steps

  ### 1. Delete All Call Records
  - Remove all entries from calls table

  ### 2. Delete All Transaction Records
  - Remove all entries from transactions table

  ### 3. Delete All Agent Assignments
  - Remove all user-agent relationship records

  ### 4. Delete All Phone Number Assignments
  - Remove all user-phone number relationship records

  ### 5. Delete All Agents
  - Remove all agent records

  ### 6. Delete All Phone Numbers
  - Remove all phone number records

  ### 7. Delete All OAuth Data
  - Clear oauth_states table
  - Clear oauth_authorization_codes table

  ### 8. Delete All API Keys
  - Remove all API key records

  ### 9. Delete All Sync Status
  - Clear sync history

  ### 10. Delete All Audit Logs
  - Remove all audit log entries

  ### 11. Clean Up Users and Billing
  - Delete all non-admin users from auth.users
  - Delete all non-admin users from users table
  - Delete all billing accounts except admin's (if exists)
  - Reset admin billing account balance to 0.00

  ## Security Notes
  - This migration is IRREVERSIBLE
  - All user data except admin will be permanently deleted
  - Admin user ID: e1ca106b-56a2-4232-8d80-a3915eac4428
  - Admin email: admin@voiceai.test
*/

-- Step 1: Delete all calls
DELETE FROM calls;

-- Step 2: Delete all transactions
DELETE FROM transactions;

-- Step 3: Delete all user-agent assignments
DELETE FROM user_agents;

-- Step 4: Delete all user-phone number assignments
DELETE FROM user_phone_numbers;

-- Step 5: Delete all agents
DELETE FROM agents;

-- Step 6: Delete all phone numbers
DELETE FROM phone_numbers;

-- Step 7: Delete all OAuth data
DELETE FROM oauth_states;
DELETE FROM oauth_authorization_codes;

-- Step 8: Delete all API keys
DELETE FROM api_keys;

-- Step 9: Delete all sync status records
DELETE FROM sync_status;

-- Step 10: Delete all audit logs
DELETE FROM audit_logs;

-- Step 11: Clean up billing accounts (keep only admin's if exists, reset to zero)
-- Delete all billing accounts except admin's
DELETE FROM billing_accounts 
WHERE user_id != 'e1ca106b-56a2-4232-8d80-a3915eac4428';

-- Reset admin billing account balance to zero (if exists)
UPDATE billing_accounts 
SET 
  wallet_balance = 0.00,
  updated_at = now()
WHERE user_id = 'e1ca106b-56a2-4232-8d80-a3915eac4428';

-- Step 12: Delete all non-admin users from public.users table
-- This will cascade to related records due to foreign key constraints
DELETE FROM users 
WHERE id != 'e1ca106b-56a2-4232-8d80-a3915eac4428';

-- Step 13: Delete all non-admin users from auth.users
-- This ensures complete removal from authentication system
DELETE FROM auth.users 
WHERE id != 'e1ca106b-56a2-4232-8d80-a3915eac4428';

-- Verification: Log the cleanup summary
DO $$
DECLARE
  user_count INTEGER;
  calls_count INTEGER;
  agents_count INTEGER;
  transactions_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO user_count FROM users;
  SELECT COUNT(*) INTO calls_count FROM calls;
  SELECT COUNT(*) INTO agents_count FROM agents;
  SELECT COUNT(*) INTO transactions_count FROM transactions;
  
  RAISE NOTICE '=== Database Cleanup Complete ===';
  RAISE NOTICE 'Users remaining: %', user_count;
  RAISE NOTICE 'Calls remaining: %', calls_count;
  RAISE NOTICE 'Agents remaining: %', agents_count;
  RAISE NOTICE 'Transactions remaining: %', transactions_count;
  RAISE NOTICE 'Admin user (e1ca106b-56a2-4232-8d80-a3915eac4428) preserved';
  RAISE NOTICE '==================================';
END $$;
