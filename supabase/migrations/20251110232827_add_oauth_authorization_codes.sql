/*
  # Add OAuth Authorization Codes Table

  ## Overview
  Store temporary authorization codes for the OAuth 2.0 flow.
  These codes are exchanged for access tokens and should expire quickly.

  ## Changes Made

  ### 1. Create oauth_authorization_codes table
  - `code` - The authorization code (unique)
  - `user_id` - The user who authorized the connection
  - `client_id` - The HighLevel client ID
  - `redirect_uri` - The redirect URI for validation
  - `scope` - The requested scopes
  - `expires_at` - Short expiration (5 minutes)
  - `used` - Track if code has been used (one-time use)

  ## Security
  - RLS policies ensure proper access control
  - Codes expire after 5 minutes
  - Codes can only be used once
  - Automatic cleanup of expired codes
*/

-- Create oauth_authorization_codes table
CREATE TABLE IF NOT EXISTS oauth_authorization_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id text NOT NULL,
  redirect_uri text NOT NULL,
  scope text,
  state text,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '5 minutes'),
  used boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_oauth_auth_codes_code ON oauth_authorization_codes(code);
CREATE INDEX IF NOT EXISTS idx_oauth_auth_codes_expires_at ON oauth_authorization_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_oauth_auth_codes_user_id ON oauth_authorization_codes(user_id);

-- Enable RLS
ALTER TABLE oauth_authorization_codes ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Service role can manage auth codes"
  ON oauth_authorization_codes FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Function to cleanup expired authorization codes
CREATE OR REPLACE FUNCTION cleanup_expired_auth_codes()
RETURNS void AS $$
BEGIN
  DELETE FROM oauth_authorization_codes WHERE expires_at < now() OR used = true;
END;
$$ LANGUAGE plpgsql;
