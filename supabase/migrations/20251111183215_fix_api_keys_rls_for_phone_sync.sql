/*
  # Fix API Keys RLS for Phone Number Sync

  ## Problem
  Users cannot read their own api_keys records due to restrictive RLS policy.
  This prevents the phone number sync from accessing the location_id.

  ## Changes
  - Add policy allowing users to view their own API keys
  - Maintain admin access to all API keys
  - Keep write operations restricted to admins only

  ## Security
  - Users can only SELECT their own api_keys (via user_id match)
  - Admins retain full access (SELECT, INSERT, UPDATE, DELETE)
  - No changes to write permissions for regular users
*/

-- Drop existing restrictive policy
DROP POLICY IF EXISTS "Admins can view and manage API keys" ON api_keys;

-- Allow users to view their own API keys
CREATE POLICY "Users can view own API keys"
  ON api_keys FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id OR
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- Allow admins to manage all API keys
CREATE POLICY "Admins can manage all API keys"
  ON api_keys FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));
