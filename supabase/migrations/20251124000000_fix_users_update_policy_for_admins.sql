/*
  # Fix Users Update Policy for Admins

  Updates the RLS policy for the users table to allow admins to update any user profile.
*/

DROP POLICY IF EXISTS "Users can update own profile" ON users;
DROP POLICY IF EXISTS "Users can update own profile or admins can update all" ON users;

CREATE POLICY "Users can update own profile or admins can update all"
  ON users FOR UPDATE
  TO authenticated
  USING (
    id = (SELECT auth.uid()) OR is_admin()
  )
  WITH CHECK (
    id = (SELECT auth.uid()) OR is_admin()
  );
