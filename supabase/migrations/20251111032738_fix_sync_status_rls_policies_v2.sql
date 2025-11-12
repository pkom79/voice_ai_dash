/*
  # Fix sync_status RLS policies
  
  1. Changes
    - Allow authenticated users to view sync status
    - Allow authenticated users to upsert sync status records
  
  2. Security
    - All authenticated users can read sync status
    - All authenticated users can update sync status (it's a global service status table)
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Admins can manage sync status" ON sync_status;
DROP POLICY IF EXISTS "Users can view sync status, admins can manage" ON sync_status;

-- Allow authenticated users to view sync status
CREATE POLICY "Authenticated users can view sync status"
  ON sync_status FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users to insert sync status
CREATE POLICY "Authenticated users can insert sync status"
  ON sync_status FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow authenticated users to update sync status
CREATE POLICY "Authenticated users can update sync status"
  ON sync_status FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);