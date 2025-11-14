/*
  # Add expired_at field to api_keys table

  ## Changes
  1. New Column
    - `expired_at` (timestamptz, nullable)
      - Tracks when a connection token was marked as expired
      - Used for admin notifications and auditing
      - Populated automatically when token refresh fails permanently

  ## Purpose
  Track token expiration events to enable:
  - Admin email notifications about expired tokens
  - Historical audit trail of connection issues
  - Better UX by showing when tokens expired
*/

-- Add expired_at column to api_keys table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'api_keys' AND column_name = 'expired_at'
  ) THEN
    ALTER TABLE api_keys ADD COLUMN expired_at timestamptz;

    COMMENT ON COLUMN api_keys.expired_at IS 'Timestamp when the connection was marked as expired due to token refresh failure';
  END IF;
END $$;

-- Create index on expired_at for efficient querying of expired connections
CREATE INDEX IF NOT EXISTS idx_api_keys_expired_at ON api_keys(expired_at) WHERE expired_at IS NOT NULL;

-- Create index on is_active and token_expires_at for expiration checks
CREATE INDEX IF NOT EXISTS idx_api_keys_active_expiry ON api_keys(is_active, token_expires_at) WHERE is_active = false;
