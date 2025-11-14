/*
  # Add sync_type field to sync_status table

  1. New Column
    - `sync_type` (text) - 'auto' or 'manual'
      - Tracks whether sync was triggered automatically on login or manually by user
      - Default is 'manual' for backward compatibility

  2. Purpose
    - Allow UI to display whether last sync was automatic or manual
    - Helps users understand sync behavior

  3. Important Notes
    - Default value is 'manual' to avoid breaking existing records
    - Check constraint ensures only valid values
*/

-- Add sync_type column to sync_status table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sync_status' AND column_name = 'sync_type'
  ) THEN
    ALTER TABLE sync_status ADD COLUMN sync_type text DEFAULT 'manual' CHECK (sync_type IN ('auto', 'manual'));
  END IF;
END $$;

-- Add comment for documentation
COMMENT ON COLUMN sync_status.sync_type IS 'Indicates if sync was triggered automatically (auto) or manually by user (manual)';
