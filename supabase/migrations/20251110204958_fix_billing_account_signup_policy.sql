/*
  # Fix Billing Account Signup Policy

  ## Changes Made
  
  Allow authenticated users to create their own billing account during signup.
  This policy ensures users can only create a billing account for themselves.
  
  ## Security
  - Users can only insert billing accounts where user_id matches their auth.uid()
  - Existing admin management policies remain unchanged
*/

-- Add policy to allow users to create their own billing account during signup
CREATE POLICY "Users can create own billing account"
  ON billing_accounts FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());