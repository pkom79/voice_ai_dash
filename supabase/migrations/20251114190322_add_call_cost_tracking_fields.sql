/*
  # Add Call Cost Tracking and Reset Functionality

  1. New Columns
    - `billing_accounts.calls_reset_at` (timestamptz, nullable)
      - Tracks when user last reset their call data
      - Sync will only fetch calls after this date
    
    - `calls.display_cost` (text, nullable)
      - Stores display value for cost (e.g., "INCLUDED" for unlimited plans)
      - When null, display the numeric cost value

  2. Purpose
    - Enable cost calculation during sync based on billing plan
    - Allow admins to reset test call data without affecting future syncs
    - Provide clear UI indication for unlimited plan calls

  3. Important Notes
    - calls_reset_at default is null (no reset has occurred)
    - display_cost default is null (show numeric cost)
    - These fields work together with existing billing system
*/

-- Add calls_reset_at to billing_accounts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'billing_accounts' AND column_name = 'calls_reset_at'
  ) THEN
    ALTER TABLE billing_accounts ADD COLUMN calls_reset_at timestamptz DEFAULT NULL;
  END IF;
END $$;

-- Add display_cost to calls table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'calls' AND column_name = 'display_cost'
  ) THEN
    ALTER TABLE calls ADD COLUMN display_cost text DEFAULT NULL;
  END IF;
END $$;

-- Add comment for documentation
COMMENT ON COLUMN billing_accounts.calls_reset_at IS 'Timestamp of last call data reset. Sync will only fetch calls after this date.';
COMMENT ON COLUMN calls.display_cost IS 'Display value for cost. If set to INCLUDED, show badge instead of numeric cost.';
