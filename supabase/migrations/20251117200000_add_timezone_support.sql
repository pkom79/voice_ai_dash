/*
  # Add Timezone Support for HighLevel Location-Based Sync

  ## Overview
  Adds timezone tracking for HighLevel locations to ensure accurate date range
  handling when syncing calls. Each location has its own timezone (e.g., 
  America/New_York, America/Los_Angeles) which affects how date ranges are
  interpreted by the HighLevel API.

  ## Changes Made

  ### 1. Add location_timezone to api_keys table
  - Stores IANA timezone identifier (e.g., 'America/New_York')
  - Fetched from HighLevel location API during OAuth connection
  - Used for all date range calculations when syncing calls

  ### 2. Add timezone tracking to call_sync_logs
  - Records which timezone was used for each sync operation
  - Enables accurate audit trail and diagnostics
  - Helps identify timezone-related sync issues

  ### 3. Add admin override tracking to call_sync_logs
  - Tracks when admins bypass calls_reset_at restriction
  - Records which admin performed the override
  - Stores original reset date for audit purposes

  ## Default Behavior
  - Existing records default to 'America/New_York' (EST/EDT)
  - New OAuth connections will fetch actual timezone from HighLevel
  - Regular user syncs respect calls_reset_at
  - Admin syncs can override with explicit date ranges
*/

-- Add location_timezone column to api_keys table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'api_keys' AND column_name = 'location_timezone'
  ) THEN
    ALTER TABLE api_keys ADD COLUMN location_timezone text DEFAULT 'America/New_York';
    
    -- Add index for efficient timezone queries
    CREATE INDEX IF NOT EXISTS idx_api_keys_location_timezone ON api_keys(location_timezone);
    
    -- Add comment
    COMMENT ON COLUMN api_keys.location_timezone IS 'IANA timezone identifier for the HighLevel location (e.g., America/New_York). Used for accurate date range calculations in call syncs.';
  END IF;
END $$;

-- Add timezone tracking to call_sync_logs table (if it exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'call_sync_logs'
  ) THEN
    -- Add timezone_used column
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'call_sync_logs' AND column_name = 'timezone_used'
    ) THEN
      ALTER TABLE call_sync_logs ADD COLUMN timezone_used text;
      COMMENT ON COLUMN call_sync_logs.timezone_used IS 'IANA timezone used for this sync operation';
    END IF;

    -- Add admin override tracking columns
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'call_sync_logs' AND column_name = 'admin_override'
    ) THEN
      ALTER TABLE call_sync_logs ADD COLUMN admin_override boolean DEFAULT false;
      COMMENT ON COLUMN call_sync_logs.admin_override IS 'True if admin bypassed calls_reset_at restriction';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'call_sync_logs' AND column_name = 'admin_user_id'
    ) THEN
      ALTER TABLE call_sync_logs ADD COLUMN admin_user_id uuid REFERENCES users(id) ON DELETE SET NULL;
      COMMENT ON COLUMN call_sync_logs.admin_user_id IS 'Admin who performed the sync (for override tracking)';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'call_sync_logs' AND column_name = 'original_reset_date'
    ) THEN
      ALTER TABLE call_sync_logs ADD COLUMN original_reset_date timestamptz;
      COMMENT ON COLUMN call_sync_logs.original_reset_date IS 'Value of calls_reset_at that was bypassed (if admin override)';
    END IF;

    -- Add index for admin override queries
    CREATE INDEX IF NOT EXISTS idx_call_sync_logs_admin_override ON call_sync_logs(admin_override) WHERE admin_override = true;
  END IF;
END $$;
