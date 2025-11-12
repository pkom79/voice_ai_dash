/*
  # Add HighLevel OAuth 2.0 Support

  ## Overview
  Transform API key authentication to OAuth 2.0 with location-level access.
  Each user can have their own OAuth connection managed by admins.

  ## Changes Made

  ### 1. Modify api_keys table
  - Add `access_token` column for OAuth access tokens
  - Add `refresh_token` column for token refresh
  - Add `token_expires_at` column to track expiration
  - Add `location_id` column for HighLevel location identifier
  - Add `company_id` column for HighLevel company identifier
  - Add `user_id` column to link OAuth connection to specific user
  - Make `encrypted_key` nullable since OAuth uses tokens instead

  ### 2. Create oauth_states table
  - Track OAuth authorization flow state parameters
  - Prevent CSRF attacks during OAuth flow
  - Store state, user_id, and expiry information

  ### 3. Create system_config table
  - Store HighLevel OAuth app credentials (client_id, client_secret)
  - Admin-only access for system-wide configuration

  ## Security
  - RLS policies ensure only admins can access OAuth credentials
  - OAuth state validation for CSRF protection
  - Automatic cleanup of expired state parameters
*/

-- Modify api_keys table to support OAuth
DO $$
BEGIN
  -- Make encrypted_key nullable for OAuth tokens
  ALTER TABLE api_keys ALTER COLUMN encrypted_key DROP NOT NULL;
  
  -- Add OAuth-specific columns
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'api_keys' AND column_name = 'access_token'
  ) THEN
    ALTER TABLE api_keys ADD COLUMN access_token text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'api_keys' AND column_name = 'refresh_token'
  ) THEN
    ALTER TABLE api_keys ADD COLUMN refresh_token text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'api_keys' AND column_name = 'token_expires_at'
  ) THEN
    ALTER TABLE api_keys ADD COLUMN token_expires_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'api_keys' AND column_name = 'location_id'
  ) THEN
    ALTER TABLE api_keys ADD COLUMN location_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'api_keys' AND column_name = 'company_id'
  ) THEN
    ALTER TABLE api_keys ADD COLUMN company_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'api_keys' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE api_keys ADD COLUMN user_id uuid REFERENCES users(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'api_keys' AND column_name = 'location_name'
  ) THEN
    ALTER TABLE api_keys ADD COLUMN location_name text;
  END IF;
END $$;

-- Create oauth_states table for CSRF protection
CREATE TABLE IF NOT EXISTS oauth_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state text UNIQUE NOT NULL,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  admin_id uuid REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create system_config table for OAuth app credentials
CREATE TABLE IF NOT EXISTS system_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value text NOT NULL,
  description text,
  is_encrypted boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_token_expires_at ON api_keys(token_expires_at);
CREATE INDEX IF NOT EXISTS idx_oauth_states_state ON oauth_states(state);
CREATE INDEX IF NOT EXISTS idx_oauth_states_expires_at ON oauth_states(expires_at);
CREATE INDEX IF NOT EXISTS idx_system_config_key ON system_config(key);

-- Enable RLS on new tables
ALTER TABLE oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;

-- RLS Policies for oauth_states
CREATE POLICY "Only admins can view oauth states"
  ON oauth_states FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Only admins can create oauth states"
  ON oauth_states FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Only admins can delete oauth states"
  ON oauth_states FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

-- RLS Policies for system_config
CREATE POLICY "Only admins can view system config"
  ON system_config FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Only admins can manage system config"
  ON system_config FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

-- Trigger for system_config updated_at
CREATE TRIGGER update_system_config_updated_at BEFORE UPDATE ON system_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to cleanup expired OAuth states
CREATE OR REPLACE FUNCTION cleanup_expired_oauth_states()
RETURNS void AS $$
BEGIN
  DELETE FROM oauth_states WHERE expires_at < now();
END;
$$ LANGUAGE plpgsql;
