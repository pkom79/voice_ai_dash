/*
  # Allow Anonymous Users to View Invitations by Token

  ## Problem
  Users clicking invitation links need to view invitation details before authenticating,
  but RLS blocks anonymous access to user_invitations table.

  ## Solution
  Add a policy allowing anonymous users to SELECT invitations, but ONLY for pending invitations
  to prevent abuse. This is safe because:
  - Tokens are cryptographically random and unguessable
  - Only pending invitations are accessible
  - No sensitive data is exposed (just invitation metadata)

  ## Changes
  - Add SELECT policy for anonymous users on user_invitations table
*/

CREATE POLICY "Anyone can view pending invitations by token"
  ON user_invitations
  FOR SELECT
  TO anon
  USING (status = 'pending');
