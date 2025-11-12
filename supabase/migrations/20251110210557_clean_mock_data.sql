/*
  # Clean Mock Data

  ## Overview
  Remove all test and mock data from the database, keeping only admin and one test user.

  ## Changes Made

  ### 1. Delete all call records
  - Remove all entries from calls table

  ### 2. Delete all transactions
  - Remove all entries from transactions table

  ### 3. Delete all agents except system-generated ones
  - Clean up test agent records

  ### 4. Delete all phone numbers
  - Remove all phone number records

  ### 5. Reset sync status
  - Clear sync history

  ### 6. Reset billing accounts
  - Set wallet balances to 0

  ### 7. Clear api_keys
  - Remove old API key entries

  ### 8. Clear audit logs
  - Remove test audit entries
*/

-- Delete all calls
DELETE FROM calls;

-- Delete all transactions
DELETE FROM transactions;

-- Delete all user_agents assignments
DELETE FROM user_agents;

-- Delete all user_phone_numbers assignments
DELETE FROM user_phone_numbers;

-- Delete all agents
DELETE FROM agents;

-- Delete all phone numbers
DELETE FROM phone_numbers;

-- Reset billing accounts wallet balances
UPDATE billing_accounts SET wallet_balance = 0.00;

-- Clear API keys
DELETE FROM api_keys;

-- Clear sync status
DELETE FROM sync_status;

-- Clear audit logs
DELETE FROM audit_logs;

-- Clear oauth states
DELETE FROM oauth_states;
