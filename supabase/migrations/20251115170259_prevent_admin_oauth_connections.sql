/*
  # Prevent Admin OAuth Connections

  ## Overview
  Admins are system operators who manage the platform, not service users.
  This migration prevents admins from creating OAuth connections and cleans up any existing admin connections.

  ## Changes Made

  ### 1. Clean up existing admin OAuth connections
  - Delete any api_keys records where user_id references an admin user
  - This ensures data consistency before applying constraints

  ### 2. Create trigger to prevent admin OAuth connections
  - Create function to check user role before INSERT/UPDATE on api_keys
  - Raise exception if attempting to create OAuth connection for admin user
  - Trigger fires BEFORE INSERT OR UPDATE on api_keys table

  ### 3. Update RLS policies
  - Add role check to api_keys INSERT policy
  - Add role check to api_keys UPDATE policy
  - Prevent admins from creating or updating OAuth connections via RLS

  ## Security
  - Multi-layer protection: trigger + RLS policies
  - Prevents admin OAuth at database, security, and application levels
  - No admin should have OAuth connections (they manage clients, not use services)

  ## Notes
  - Safe to run multiple times (uses IF EXISTS checks)
  - Does not affect client user OAuth connections
  - Admin users can still view OAuth connections via admin interface
*/

-- Step 1: Clean up any existing admin OAuth connections
DELETE FROM api_keys
WHERE user_id IN (
  SELECT id FROM users WHERE role = 'admin'
);

-- Step 2: Create trigger function to prevent admin OAuth connections
CREATE OR REPLACE FUNCTION prevent_admin_oauth_connection()
RETURNS TRIGGER AS $$
DECLARE
  user_role text;
BEGIN
  -- Only check if user_id is being set (OAuth connection)
  IF NEW.user_id IS NOT NULL THEN
    -- Get the role of the user
    SELECT role INTO user_role
    FROM users
    WHERE id = NEW.user_id;

    -- Raise exception if user is an admin
    IF user_role = 'admin' THEN
      RAISE EXCEPTION 'Admins cannot have OAuth connections. Admins are system operators, not service users.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if it exists, then create it
DROP TRIGGER IF EXISTS check_admin_oauth_connection ON api_keys;

CREATE TRIGGER check_admin_oauth_connection
  BEFORE INSERT OR UPDATE ON api_keys
  FOR EACH ROW
  EXECUTE FUNCTION prevent_admin_oauth_connection();

-- Step 3: Update RLS policies to add role check

-- Drop existing INSERT policy for api_keys (if it exists)
DROP POLICY IF EXISTS "Admins can manage API keys" ON api_keys;
DROP POLICY IF EXISTS "Only admins can manage API keys" ON api_keys;
DROP POLICY IF EXISTS "Only admins can insert api_keys" ON api_keys;

-- Create new INSERT policy with admin OAuth prevention
CREATE POLICY "Admins can insert api_keys for client users only"
  ON api_keys FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
    AND (
      user_id IS NULL
      OR EXISTS (SELECT 1 FROM users WHERE id = user_id AND role = 'client')
    )
  );

-- Drop existing UPDATE policy for api_keys (if it exists)
DROP POLICY IF EXISTS "Admins can update api_keys" ON api_keys;
DROP POLICY IF EXISTS "Only admins can update API keys" ON api_keys;

-- Create new UPDATE policy with admin OAuth prevention
CREATE POLICY "Admins can update api_keys for client users only"
  ON api_keys FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
    AND (
      user_id IS NULL
      OR EXISTS (SELECT 1 FROM users WHERE id = user_id AND role = 'client')
    )
  );

-- Ensure SELECT and DELETE policies exist for admins
DO $$
BEGIN
  -- Check if SELECT policy exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'api_keys' AND policyname = 'Only admins can view API keys'
  ) THEN
    CREATE POLICY "Only admins can view API keys"
      ON api_keys FOR SELECT
      TO authenticated
      USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));
  END IF;

  -- Check if DELETE policy exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'api_keys' AND policyname = 'Only admins can delete API keys'
  ) THEN
    CREATE POLICY "Only admins can delete API keys"
      ON api_keys FOR DELETE
      TO authenticated
      USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));
  END IF;
END $$;

-- Add comment to trigger function for documentation
COMMENT ON FUNCTION prevent_admin_oauth_connection() IS 'Prevents admin users from having OAuth connections. Admins are system operators who manage clients, not service users.';