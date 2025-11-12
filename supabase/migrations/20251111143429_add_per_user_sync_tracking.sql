/*
  # Add Per-User Sync Tracking

  1. Changes to sync_status table
    - Add `user_id` column for per-user sync tracking
    - Update unique constraint to be on (service, user_id) instead of just service
    - Allow null user_id for global sync status records

  2. Security
    - Update RLS policies to allow users to view their own sync status
    - Admins can view and manage all sync status records

  3. Notes
    - Existing sync_status records (with null user_id) represent global sync status
    - New records with user_id represent per-user sync timestamps
    - This enables tracking when each user last synced their data
*/

-- Drop existing unique constraint on service
ALTER TABLE sync_status DROP CONSTRAINT IF EXISTS sync_status_service_key;

-- Add user_id column (nullable to support global sync records)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sync_status' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE sync_status ADD COLUMN user_id uuid REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Create new unique constraint on service and user_id combination
-- This allows multiple records per service (one per user)
CREATE UNIQUE INDEX IF NOT EXISTS sync_status_service_user_idx
  ON sync_status(service, user_id)
  WHERE user_id IS NOT NULL;

-- Create unique constraint for global sync records (where user_id is null)
CREATE UNIQUE INDEX IF NOT EXISTS sync_status_service_global_idx
  ON sync_status(service)
  WHERE user_id IS NULL;

-- Update RLS policies for sync_status
DROP POLICY IF EXISTS "Users can view sync status" ON sync_status;
DROP POLICY IF EXISTS "Admins can insert sync status" ON sync_status;
DROP POLICY IF EXISTS "Admins can update sync status" ON sync_status;

-- Allow users to view their own sync status and global sync status
CREATE POLICY "Users can view own and global sync status"
  ON sync_status FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid() OR
    user_id IS NULL OR
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- Allow authenticated users to insert their own sync status
CREATE POLICY "Users can insert own sync status"
  ON sync_status FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- Allow users to update their own sync status, admins can update all
CREATE POLICY "Users can update own sync status"
  ON sync_status FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid() OR
    user_id IS NULL OR
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    user_id = auth.uid() OR
    user_id IS NULL OR
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- Allow admins to delete sync status records
CREATE POLICY "Admins can delete sync status"
  ON sync_status FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));
