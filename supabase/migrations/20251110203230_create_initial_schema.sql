/*
  # Voice AI Dashboard - Initial Database Schema

  ## Overview
  Complete database schema for Voice AI Dashboard supporting client and admin user management,
  call tracking, billing, and HighLevel integration.

  ## Tables Created

  ### 1. users (extends auth.users)
  - `id` (uuid, references auth.users)
  - `role` (text: 'client' or 'admin')
  - `first_name` (text)
  - `last_name` (text)
  - `business_name` (text)
  - `phone_number` (text)
  - `is_active` (boolean)
  - `last_login` (timestamptz)
  - `notification_preferences` (jsonb)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### 2. agents
  - `id` (uuid, primary key)
  - `highlevel_agent_id` (text, unique)
  - `name` (text)
  - `description` (text)
  - `configuration` (jsonb)
  - `is_active` (boolean)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### 3. phone_numbers
  - `id` (uuid, primary key)
  - `phone_number` (text, unique)
  - `label` (text)
  - `is_active` (boolean)
  - `created_at` (timestamptz)

  ### 4. user_agents (junction table)
  - `user_id` (uuid, references users)
  - `agent_id` (uuid, references agents)
  - `assigned_at` (timestamptz)

  ### 5. user_phone_numbers (junction table)
  - `user_id` (uuid, references users)
  - `phone_number_id` (uuid, references phone_numbers)
  - `assigned_at` (timestamptz)

  ### 6. billing_accounts
  - `id` (uuid, primary key)
  - `user_id` (uuid, references users, unique)
  - `payment_model` (text: 'flat_fee' or 'pay_per_use')
  - `wallet_balance` (decimal)
  - `monthly_fee` (decimal)
  - `stripe_customer_id` (text)
  - `auto_replenish_enabled` (boolean)
  - `auto_replenish_threshold` (decimal)
  - `auto_replenish_amount` (decimal)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### 7. transactions
  - `id` (uuid, primary key)
  - `user_id` (uuid, references users)
  - `type` (text: 'replenishment', 'deduction', 'refund', 'fee')
  - `amount` (decimal)
  - `balance_before` (decimal)
  - `balance_after` (decimal)
  - `description` (text)
  - `stripe_payment_id` (text)
  - `metadata` (jsonb)
  - `created_at` (timestamptz)

  ### 8. calls
  - `id` (uuid, primary key)
  - `highlevel_call_id` (text, unique)
  - `user_id` (uuid, references users)
  - `agent_id` (uuid, references agents)
  - `phone_number_id` (uuid, references phone_numbers)
  - `direction` (text: 'inbound' or 'outbound')
  - `contact_name` (text)
  - `from_number` (text)
  - `to_number` (text)
  - `status` (text)
  - `duration_seconds` (integer)
  - `cost` (decimal)
  - `action_triggered` (text)
  - `sentiment` (text)
  - `summary` (text)
  - `transcript` (text)
  - `recording_url` (text)
  - `workflow_names` (text[])
  - `notes` (text)
  - `tags` (text[])
  - `latency_ms` (integer)
  - `is_test_call` (boolean)
  - `call_started_at` (timestamptz)
  - `call_ended_at` (timestamptz)
  - `metadata` (jsonb)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### 9. api_keys
  - `id` (uuid, primary key)
  - `name` (text)
  - `service` (text: 'highlevel')
  - `encrypted_key` (text)
  - `is_active` (boolean)
  - `last_used_at` (timestamptz)
  - `created_by` (uuid, references users)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### 10. sync_status
  - `id` (uuid, primary key)
  - `service` (text)
  - `last_sync_at` (timestamptz)
  - `last_sync_status` (text: 'success' or 'failure')
  - `last_sync_message` (text)
  - `records_synced` (integer)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### 11. audit_logs
  - `id` (uuid, primary key)
  - `admin_user_id` (uuid, references users)
  - `action` (text)
  - `target_user_id` (uuid, references users)
  - `details` (jsonb)
  - `ip_address` (text)
  - `created_at` (timestamptz)

  ## Security
  - Enable RLS on all tables
  - Clients can only access their own data
  - Admins have full access to all data
  - API keys are accessible only to admins

  ## Indexes
  - Optimized indexes for call log queries
  - User lookups and filtering
  - Transaction history queries
*/

-- Create users table (extends auth.users)
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'client' CHECK (role IN ('client', 'admin')),
  first_name text NOT NULL,
  last_name text NOT NULL,
  business_name text,
  phone_number text,
  is_active boolean DEFAULT true,
  last_login timestamptz,
  notification_preferences jsonb DEFAULT '{"low_balance_alerts": true, "weekly_summaries": true}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create agents table
CREATE TABLE IF NOT EXISTS agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  highlevel_agent_id text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  configuration jsonb DEFAULT '{}'::jsonb,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create phone_numbers table
CREATE TABLE IF NOT EXISTS phone_numbers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number text UNIQUE NOT NULL,
  label text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Create user_agents junction table
CREATE TABLE IF NOT EXISTS user_agents (
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES agents(id) ON DELETE CASCADE,
  assigned_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, agent_id)
);

-- Create user_phone_numbers junction table
CREATE TABLE IF NOT EXISTS user_phone_numbers (
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  phone_number_id uuid REFERENCES phone_numbers(id) ON DELETE CASCADE,
  assigned_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, phone_number_id)
);

-- Create billing_accounts table
CREATE TABLE IF NOT EXISTS billing_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  payment_model text NOT NULL DEFAULT 'pay_per_use' CHECK (payment_model IN ('flat_fee', 'pay_per_use')),
  wallet_balance decimal(10, 2) DEFAULT 0.00,
  monthly_fee decimal(10, 2) DEFAULT 0.00,
  stripe_customer_id text,
  auto_replenish_enabled boolean DEFAULT false,
  auto_replenish_threshold decimal(10, 2) DEFAULT 10.00,
  auto_replenish_amount decimal(10, 2) DEFAULT 50.00,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create transactions table
CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('replenishment', 'deduction', 'refund', 'fee')),
  amount decimal(10, 2) NOT NULL,
  balance_before decimal(10, 2) NOT NULL,
  balance_after decimal(10, 2) NOT NULL,
  description text NOT NULL,
  stripe_payment_id text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Create calls table
CREATE TABLE IF NOT EXISTS calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  highlevel_call_id text UNIQUE NOT NULL,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES agents(id) ON DELETE SET NULL,
  phone_number_id uuid REFERENCES phone_numbers(id) ON DELETE SET NULL,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  contact_name text,
  from_number text NOT NULL,
  to_number text NOT NULL,
  status text,
  duration_seconds integer DEFAULT 0,
  cost decimal(10, 4) DEFAULT 0.00,
  action_triggered text,
  sentiment text,
  summary text,
  transcript text,
  recording_url text,
  workflow_names text[] DEFAULT ARRAY[]::text[],
  notes text,
  tags text[] DEFAULT ARRAY[]::text[],
  latency_ms integer,
  is_test_call boolean DEFAULT false,
  call_started_at timestamptz,
  call_ended_at timestamptz,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create api_keys table
CREATE TABLE IF NOT EXISTS api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  service text NOT NULL CHECK (service IN ('highlevel')),
  encrypted_key text NOT NULL,
  is_active boolean DEFAULT true,
  last_used_at timestamptz,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create sync_status table
CREATE TABLE IF NOT EXISTS sync_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service text NOT NULL UNIQUE,
  last_sync_at timestamptz,
  last_sync_status text CHECK (last_sync_status IN ('success', 'failure')),
  last_sync_message text,
  records_synced integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create audit_logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  details jsonb DEFAULT '{}'::jsonb,
  ip_address text,
  created_at timestamptz DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);
CREATE INDEX IF NOT EXISTS idx_calls_user_id ON calls(user_id);
CREATE INDEX IF NOT EXISTS idx_calls_agent_id ON calls(agent_id);
CREATE INDEX IF NOT EXISTS idx_calls_direction ON calls(direction);
CREATE INDEX IF NOT EXISTS idx_calls_is_test_call ON calls(is_test_call);
CREATE INDEX IF NOT EXISTS idx_calls_call_started_at ON calls(call_started_at);
CREATE INDEX IF NOT EXISTS idx_calls_status ON calls(status);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_admin_user_id ON audit_logs(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

-- Enable Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE phone_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_phone_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for users table
CREATE POLICY "Users can view own profile"
  ON users FOR SELECT
  TO authenticated
  USING (id = auth.uid() OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "Admins can view all users"
  ON users FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can insert users"
  ON users FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can update all users"
  ON users FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can delete users"
  ON users FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

-- RLS Policies for agents table
CREATE POLICY "Users can view assigned agents"
  ON agents FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
    OR EXISTS (SELECT 1 FROM user_agents WHERE user_id = auth.uid() AND agent_id = agents.id)
  );

CREATE POLICY "Admins can manage agents"
  ON agents FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

-- RLS Policies for phone_numbers table
CREATE POLICY "Users can view assigned phone numbers"
  ON phone_numbers FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
    OR EXISTS (SELECT 1 FROM user_phone_numbers WHERE user_id = auth.uid() AND phone_number_id = phone_numbers.id)
  );

CREATE POLICY "Admins can manage phone numbers"
  ON phone_numbers FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

-- RLS Policies for user_agents junction table
CREATE POLICY "Users can view own agent assignments"
  ON user_agents FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can manage agent assignments"
  ON user_agents FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

-- RLS Policies for user_phone_numbers junction table
CREATE POLICY "Users can view own phone number assignments"
  ON user_phone_numbers FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can manage phone number assignments"
  ON user_phone_numbers FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

-- RLS Policies for billing_accounts table
CREATE POLICY "Users can view own billing account"
  ON billing_accounts FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can manage billing accounts"
  ON billing_accounts FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

-- RLS Policies for transactions table
CREATE POLICY "Users can view own transactions"
  ON transactions FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can manage transactions"
  ON transactions FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

-- RLS Policies for calls table
CREATE POLICY "Users can view own calls"
  ON calls FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Users can update own call notes"
  ON calls FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can manage all calls"
  ON calls FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

-- RLS Policies for api_keys table
CREATE POLICY "Only admins can view API keys"
  ON api_keys FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Only admins can manage API keys"
  ON api_keys FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

-- RLS Policies for sync_status table
CREATE POLICY "Authenticated users can view sync status"
  ON sync_status FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Only admins can manage sync status"
  ON sync_status FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

-- RLS Policies for audit_logs table
CREATE POLICY "Only admins can view audit logs"
  ON audit_logs FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Only admins can create audit logs"
  ON audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_agents_updated_at BEFORE UPDATE ON agents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_billing_accounts_updated_at BEFORE UPDATE ON billing_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_calls_updated_at BEFORE UPDATE ON calls
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_api_keys_updated_at BEFORE UPDATE ON api_keys
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sync_status_updated_at BEFORE UPDATE ON sync_status
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();