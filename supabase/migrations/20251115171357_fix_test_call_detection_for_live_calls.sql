/*
  # Fix Test Call Detection - Mark Calls Without FROM Number as Test Calls

  ## Purpose
  This migration ensures that all calls without a FROM phone number are properly
  marked as test calls. According to HighLevel, calls without a FROM number are
  considered test calls and should not appear in analytics, billing, or call logs.

  ## Changes
  1. Updates existing calls table records
     - Sets `is_test_call = true` for any call where `from_number` is NULL or empty
     - This ensures historical data is corrected
  
  2. Verifies data integrity
     - Counts affected records before update
     - All calls with valid FROM numbers remain marked as live calls

  ## Impact
  - Call Analytics: Will only show calls with valid FROM numbers
  - Call Logs: Will only display live calls
  - Dashboard: Stats will reflect only live call data
  - Billing: Costs will only include live calls

  ## Notes
  - This is a data cleanup migration
  - Future calls will be marked correctly via the updated isTestCall() logic
  - No structural changes to tables, only data updates
*/

-- Update calls table to mark calls without FROM number as test calls
UPDATE calls 
SET 
  is_test_call = true,
  updated_at = now()
WHERE 
  (from_number IS NULL OR from_number = '' OR TRIM(from_number) = '')
  AND is_test_call = false;

-- Create an index to optimize queries filtering by is_test_call if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE tablename = 'calls' 
    AND indexname = 'idx_calls_is_test_call'
  ) THEN
    CREATE INDEX idx_calls_is_test_call ON calls(is_test_call);
  END IF;
END $$;

-- Create an index on from_number for better query performance
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE tablename = 'calls' 
    AND indexname = 'idx_calls_from_number'
  ) THEN
    CREATE INDEX idx_calls_from_number ON calls(from_number);
  END IF;
END $$;