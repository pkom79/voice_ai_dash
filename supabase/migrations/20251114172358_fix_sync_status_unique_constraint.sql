/*
  # Fix sync_status unique constraint

  1. Changes
    - Add unique constraint on (service, user_id) to support per-user sync tracking
    - This allows upsert operations to work correctly
  
  2. Security
    - No changes to RLS policies needed
*/

-- Add unique constraint to support upsert on service + user_id
ALTER TABLE sync_status 
  DROP CONSTRAINT IF EXISTS sync_status_service_user_id_key;

ALTER TABLE sync_status 
  ADD CONSTRAINT sync_status_service_user_id_key 
  UNIQUE (service, user_id);
