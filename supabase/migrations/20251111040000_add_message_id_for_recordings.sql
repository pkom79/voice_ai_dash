/*
  # Add message_id for Call Recording Access

  ## Changes
  - Add `message_id` column to `calls` table
  - Add `location_id` column to `calls` table (needed for recording API endpoint)
  - Add index on message_id for faster lookups

  ## Purpose
  These fields enable direct access to call recordings through the HighLevel Conversations API.
  The recording endpoint requires both messageId and locationId:
  GET /conversations/messages/{messageId}/locations/{locationId}/recording

  ## Security
  No RLS changes needed - existing policies apply to all columns.
*/

-- Add message_id column to store the HighLevel message identifier
ALTER TABLE calls
ADD COLUMN IF NOT EXISTS message_id text;

-- Add location_id column to store the HighLevel location identifier
ALTER TABLE calls
ADD COLUMN IF NOT EXISTS location_id text;

-- Add index for faster recording lookups
CREATE INDEX IF NOT EXISTS idx_calls_message_id ON calls(message_id);

-- Add helpful comment
COMMENT ON COLUMN calls.message_id IS 'HighLevel message ID for accessing call recordings via Conversations API';
COMMENT ON COLUMN calls.location_id IS 'HighLevel location ID required for recording API endpoint';
