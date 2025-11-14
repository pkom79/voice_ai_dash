/*
  # Enhance Agents Table for Admin-Controlled Assignment

  1. Changes to `agents` Table
    - Add `location_id` (text, nullable) - HighLevel location reference
    - Add `source_platform` (text, default 'highlevel') - Integration source identifier
    - Add `is_active` (boolean, default true) - Whether agent still exists in source platform
    - Add `last_verified_at` (timestamptz, nullable) - Last time agent was confirmed active
    - Add composite index on (location_id, highlevel_agent_id) for efficient lookups
    - Add index on is_active for filtering

  2. Security
    - No RLS changes needed (existing policies sufficient)
    - Service role can create agents via edge functions
    - Admins can manage all agents
    - Users can only see their assigned agents

  3. Notes
    - Flexible structure allows future non-HighLevel integrations
    - location_id is informational, not part of uniqueness constraint
    - is_active enables soft deletion tracking without data loss
    - last_verified_at helps identify stale agent data
*/

-- Add new columns to agents table
DO $$
BEGIN
  -- Add location_id if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'agents' AND column_name = 'location_id'
  ) THEN
    ALTER TABLE agents ADD COLUMN location_id text;
  END IF;

  -- Add source_platform if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'agents' AND column_name = 'source_platform'
  ) THEN
    ALTER TABLE agents ADD COLUMN source_platform text DEFAULT 'highlevel' NOT NULL;
  END IF;

  -- Add is_active if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'agents' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE agents ADD COLUMN is_active boolean DEFAULT true NOT NULL;
  END IF;

  -- Add last_verified_at if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'agents' AND column_name = 'last_verified_at'
  ) THEN
    ALTER TABLE agents ADD COLUMN last_verified_at timestamptz;
  END IF;
END $$;

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_agents_location_highlevel_id
  ON agents(location_id, highlevel_agent_id);

CREATE INDEX IF NOT EXISTS idx_agents_is_active
  ON agents(is_active);

CREATE INDEX IF NOT EXISTS idx_agents_source_platform
  ON agents(source_platform);

-- Update existing agents to set default values
UPDATE agents
SET
  source_platform = 'highlevel',
  is_active = true,
  last_verified_at = now()
WHERE source_platform IS NULL OR is_active IS NULL;

-- Add helpful comment
COMMENT ON COLUMN agents.location_id IS 'Reference to HighLevel location ID (informational, not enforced FK for flexibility)';
COMMENT ON COLUMN agents.source_platform IS 'Integration source: highlevel, future platforms, etc.';
COMMENT ON COLUMN agents.is_active IS 'Whether agent still exists and is accessible in source platform';
COMMENT ON COLUMN agents.last_verified_at IS 'Last time agent was confirmed active via API verification';
