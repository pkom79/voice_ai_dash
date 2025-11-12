/*
  # Add recording fields to calls table

  1. Changes
    - Add `message_id` column to store HighLevel conversation message ID
    - Add `location_id` column to store HighLevel location ID
    - Both fields are needed for accessing call recordings via the Conversations API

  2. Notes
    - These columns will be populated from the HighLevel API response during sync
    - They're stored separately from metadata for easier querying and recording access
    - Nullable because existing calls may not have this data
    - The message_id is unique per call/conversation
    - The location_id identifies which HighLevel location/sub-account the call belongs to
*/

-- Add message_id column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'calls' AND column_name = 'message_id'
  ) THEN
    ALTER TABLE calls ADD COLUMN message_id text;
  END IF;
END $$;

-- Add location_id column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'calls' AND column_name = 'location_id'
  ) THEN
    ALTER TABLE calls ADD COLUMN location_id text;
  END IF;
END $$;

-- Add indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_calls_message_id ON calls(message_id) WHERE message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_calls_location_id ON calls(location_id) WHERE location_id IS NOT NULL;

-- Add composite index for location_id + message_id for recording lookups
CREATE INDEX IF NOT EXISTS idx_calls_location_message ON calls(location_id, message_id) 
WHERE message_id IS NOT NULL AND location_id IS NOT NULL;
