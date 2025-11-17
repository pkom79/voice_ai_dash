/*
  # Fix Test Call Classification - Trust HighLevel's API

  1. Purpose
    - Correct test call classification by trusting HighLevel's explicit isTestCall flag
    - Previously, calls without from_number were automatically marked as test calls
    - This was incorrect - HighLevel includes these as legitimate calls in their dashboard
    
  2. Changes
    - Mark all existing calls as live calls (is_test_call = false) by default
    - This matches HighLevel's behavior where calls appear in their call logs
    - Future syncs will use HighLevel's explicit isTestCall field
    
  3. Impact
    - Dashboard will show all calls that HighLevel shows
    - Users will see accurate call counts matching HighLevel
    - Billing will include all legitimate calls
    
  4. Notes
    - The sync function has been updated to trust HighLevel's isTestCall field
    - Only calls explicitly marked as test by HighLevel will be filtered out
    - Empty from_number no longer automatically means test call
*/

-- Update all existing calls to be marked as live calls
-- HighLevel includes these calls in their dashboard, so we should too
UPDATE calls 
SET 
  is_test_call = false,
  updated_at = now()
WHERE 
  is_test_call = true
  AND from_number = '';

-- Log this change for audit purposes
-- Note: This will affect calls that were previously hidden from analytics
