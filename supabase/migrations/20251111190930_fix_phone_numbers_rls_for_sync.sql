/*
  # Fix Phone Numbers RLS Policies for Sync

  ## Problem
  Users with 'client' role cannot insert phone numbers during sync because RLS policy only allows admins.
  
  ## Changes
  1. Add INSERT policy for authenticated users to create phone numbers
  2. Keep existing policies for SELECT and admin management
  
  ## Security
  - Users can only insert phone numbers (from HighLevel sync)
  - Only admins can UPDATE or DELETE
  - All authenticated users can SELECT (view)
*/

-- Drop existing restrictive policy
DROP POLICY IF EXISTS "Admins can manage phone numbers" ON phone_numbers;

-- Create separate policies for better control
CREATE POLICY "Authenticated users can insert phone numbers"
  ON phone_numbers
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Admins can update phone numbers"
  ON phone_numbers
  FOR UPDATE
  TO authenticated
  USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

CREATE POLICY "Admins can delete phone numbers"
  ON phone_numbers
  FOR DELETE
  TO authenticated
  USING (get_user_role() = 'admin');
