/*
  # Fix agent_phone_numbers RLS policy

  1. Changes
    - Update INSERT policy to allow users to link phones to agents during sync
    - This is needed because phone linking happens before agent assignment
  
  2. Security
    - Users can only link phones for their own location's agents
    - Admins can link any phone to any agent
*/

-- Drop existing insert policy
DROP POLICY IF EXISTS "Users can insert agent phone numbers for assigned agents" ON agent_phone_numbers;

-- Create new insert policy that allows linking during sync
CREATE POLICY "Users can insert agent phone numbers"
  ON agent_phone_numbers FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Admins can link any phone to any agent
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
    OR
    -- Users can link phones to agents from their connected location
    EXISTS (
      SELECT 1 FROM api_keys
      JOIN agents ON agents.location_id = api_keys.location_id
      WHERE api_keys.user_id = auth.uid()
      AND api_keys.is_active = true
      AND agents.id = agent_phone_numbers.agent_id
    )
  );
