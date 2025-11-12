/*
  # Fix Security Issues - Part 1: Indexes

  1. Add Missing Index
    - Add index on sync_status.user_id for foreign key performance

  2. Remove Unused Indexes
    - Remove 35 unused indexes to reduce maintenance overhead
*/

-- Add missing index
CREATE INDEX IF NOT EXISTS idx_sync_status_user_id ON sync_status(user_id);

-- Remove unused indexes
DROP INDEX IF EXISTS idx_users_is_active;
DROP INDEX IF EXISTS idx_calls_status;
DROP INDEX IF EXISTS idx_transactions_created_at;
DROP INDEX IF EXISTS idx_audit_logs_created_at;
DROP INDEX IF EXISTS idx_calls_location_message;
DROP INDEX IF EXISTS idx_api_keys_token_expires_at;
DROP INDEX IF EXISTS idx_oauth_states_expires_at;
DROP INDEX IF EXISTS idx_system_config_key;
DROP INDEX IF EXISTS idx_api_keys_created_by;
DROP INDEX IF EXISTS idx_calls_phone_number_id;
DROP INDEX IF EXISTS idx_oauth_states_admin_id;
DROP INDEX IF EXISTS idx_oauth_states_user_id;
DROP INDEX IF EXISTS idx_calls_message_id;
DROP INDEX IF EXISTS idx_calls_location_id;
DROP INDEX IF EXISTS idx_oauth_auth_codes_code;
DROP INDEX IF EXISTS idx_oauth_auth_codes_expires_at;
DROP INDEX IF EXISTS idx_agent_phone_numbers_phone_number_id;
DROP INDEX IF EXISTS idx_agents_number_pool_id;
DROP INDEX IF EXISTS idx_agents_inbound_phone;
DROP INDEX IF EXISTS idx_phone_numbers_highlevel_id;
DROP INDEX IF EXISTS idx_usage_logs_user_id;
DROP INDEX IF EXISTS idx_usage_logs_call_id;
DROP INDEX IF EXISTS idx_usage_logs_created_at;
DROP INDEX IF EXISTS idx_usage_logs_user_date;
DROP INDEX IF EXISTS idx_wallet_transactions_type;
DROP INDEX IF EXISTS idx_wallet_transactions_created_at;
DROP INDEX IF EXISTS idx_wallet_transactions_admin_id;
DROP INDEX IF EXISTS idx_billing_invoices_user_id;
DROP INDEX IF EXISTS idx_billing_invoices_status;
DROP INDEX IF EXISTS idx_billing_invoices_cycle_start;
DROP INDEX IF EXISTS idx_billing_invoices_stripe_invoice_id;
DROP INDEX IF EXISTS idx_billing_accounts_billing_plan;
DROP INDEX IF EXISTS idx_billing_accounts_next_payment_at;
DROP INDEX IF EXISTS idx_billing_accounts_grace_until;
DROP INDEX IF EXISTS idx_billing_accounts_past_due_check;
DROP INDEX IF EXISTS idx_billing_accounts_subscription_status;