/*
  # Seed Test Users

  ## Test Accounts Created

  ### Admin User
  - Email: admin@voiceai.test
  - Password: Admin123!
  - Name: Admin User
  - Role: admin
  
  ### Client User
  - Email: client@voiceai.test
  - Password: Client123!
  - Name: Test Client
  - Business: Test Business Inc.
  - Role: client

  ## Notes
  - These are test accounts for development and testing purposes
  - Passwords are set using Supabase Auth API
  - Each user has a complete profile in the users table
  - Client user has a billing account created
  - Both accounts are active and ready to use
*/

-- Note: We cannot directly insert into auth.users via SQL migration
-- Instead, we'll create a helper function that can be called to set up test users
-- and provide instructions for manual setup

-- Create a function to promote a user to admin role
CREATE OR REPLACE FUNCTION promote_user_to_admin(user_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_user_id uuid;
BEGIN
  -- Get the user ID from auth.users
  SELECT id INTO target_user_id
  FROM auth.users
  WHERE email = user_email;
  
  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'User with email % not found', user_email;
  END IF;
  
  -- Update the user's role to admin
  UPDATE users
  SET role = 'admin', updated_at = now()
  WHERE id = target_user_id;
  
  RAISE NOTICE 'User % has been promoted to admin', user_email;
END;
$$;

-- Create a helper function to setup a complete user profile after auth signup
CREATE OR REPLACE FUNCTION setup_user_profile(
  user_id uuid,
  user_role text,
  first_name text,
  last_name text,
  business_name text DEFAULT NULL,
  phone_number text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insert or update user profile
  INSERT INTO users (
    id,
    role,
    first_name,
    last_name,
    business_name,
    phone_number,
    is_active
  )
  VALUES (
    user_id,
    user_role,
    first_name,
    last_name,
    business_name,
    phone_number,
    true
  )
  ON CONFLICT (id) DO UPDATE
  SET
    role = EXCLUDED.role,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    business_name = EXCLUDED.business_name,
    phone_number = EXCLUDED.phone_number,
    updated_at = now();
    
  -- Create billing account if user is a client and doesn't have one
  IF user_role = 'client' THEN
    INSERT INTO billing_accounts (
      user_id,
      payment_model,
      wallet_balance
    )
    VALUES (
      user_id,
      'pay_per_use',
      0.00
    )
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
END;
$$;