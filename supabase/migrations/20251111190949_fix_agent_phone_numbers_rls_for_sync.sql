/*
  # Fix Agent Phone Numbers RLS Policies for Sync

  ## Problem
  Users with 'client' role cannot insert agent_phone_numbers during sync because RLS policy only allows admins.
  
  ## Changes
  1. Add INSERT policy for users to create agent-phone links for their assigned agents
  2. Keep existing policies for SELECT and admin management
  
  ## Security
  - Users can only insert links for agents they are assigned to
  - Only admins can UPDATE or DELETE
  - Users can view links for their assigned agents
*/

-- Drop existing restrictive policy
DROP POLICY IF EXISTS "Admins can manage agent phone numbers" ON agent_phone_numbers;

-- Create separate policies for better control
CREATE POLICY "Users can insert agent phone numbers for assigned agents"
  ON agent_phone_numbers
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_agents
      WHERE user_agents.user_id = auth.uid()
      AND user_agents.agent_id = agent_phone_numbers.agent_id
    )
    OR
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Admins can update agent phone numbers"
  ON agent_phone_numbers
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete agent phone numbers"
  ON agent_phone_numbers
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );
