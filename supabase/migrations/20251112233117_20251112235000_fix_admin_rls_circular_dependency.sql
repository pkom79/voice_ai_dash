/*
  # Fix Circular RLS Dependency for Admin Users

  ## Problem
  The "Admins can view all users" policy had a circular dependency - it checked if the user
  is an admin by querying the users table, but that query itself required the SELECT policy
  to pass first, creating a deadlock.

  ## Solution
  1. Drop the problematic admin policy
  2. Create a simpler policy that combines user self-view and admin view without circular dependency
  3. Use a helper function that checks the users table directly with security definer

  ## Changes
  - Drop old admin SELECT policy
  - Create helper function to check if user is admin
  - Create new combined SELECT policy
*/

-- Drop the circular policy
DROP POLICY IF EXISTS "Admins can view all users" ON users;
DROP POLICY IF EXISTS "Users can view own profile" ON users;

-- Create a helper function to check admin status (runs with security definer to bypass RLS)
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role = 'admin'
    AND is_active = true
  );
$$;

-- Create a combined policy that allows users to see themselves OR admins to see everyone
CREATE POLICY "Users can view own profile or admins can view all"
  ON users
  FOR SELECT
  TO authenticated
  USING (
    id = auth.uid() OR is_admin()
  );
