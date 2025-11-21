/*
  # Fix Admin User Visibility

  Updates the is_admin() function to be more robust by setting search_path and using current_setting directly.
  Ensures the RLS policy for users table allows admins to view all users.
*/

-- Update is_admin function with explicit search_path and safe uid retrieval
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = (select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid)
    AND role = 'admin'
    AND is_active = true
  );
$$;

-- Ensure the policy exists and is correct
DROP POLICY IF EXISTS "Users can view own profile or admins can view all" ON users;

CREATE POLICY "Users can view own profile or admins can view all"
  ON users
  FOR SELECT
  TO authenticated
  USING (
    id = (select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid) OR is_admin()
  );
