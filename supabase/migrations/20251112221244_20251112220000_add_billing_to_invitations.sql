/*
  # Add Billing Configuration to User Invitations

  ## Overview
  Enhances the user_invitations table to store billing configuration that will be
  applied when the user accepts the invitation and sets their password.

  ## Changes to Existing Tables

  ### user_invitations
  - Add `user_id` (nullable) - Reference to pre-created user account
  - Add `billing_plan` - Plan type: 'pay_per_use', 'unlimited', 'complimentary'
  - Add `rate_per_minute_cents` - Custom rate for pay_per_use plans
  - Add `admin_notes` - Admin notes for billing configuration
  - Add `first_name` - Pre-filled first name for invitation
  - Add `last_name` - Pre-filled last name for invitation
  - Add `business_name` - Pre-filled business name for invitation
  - Add `phone_number` - Pre-filled phone number for invitation

  ## Usage Flow
  1. Admin creates user account without password
  2. Admin optionally sends invitation immediately or later
  3. Invitation stores all billing and profile configuration
  4. User receives email with invitation link
  5. User sets password via invitation link
  6. System applies stored billing configuration to user's account

  ## Security
  - RLS policies already in place for user_invitations
  - Only admins can create and manage invitations
*/

-- Add user_id reference and billing fields to user_invitations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_invitations' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE user_invitations ADD COLUMN user_id uuid REFERENCES users(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_invitations' AND column_name = 'billing_plan'
  ) THEN
    ALTER TABLE user_invitations ADD COLUMN billing_plan text DEFAULT 'pay_per_use' CHECK (billing_plan IN ('pay_per_use', 'unlimited', 'complimentary'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_invitations' AND column_name = 'rate_per_minute_cents'
  ) THEN
    ALTER TABLE user_invitations ADD COLUMN rate_per_minute_cents integer DEFAULT 500;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_invitations' AND column_name = 'admin_notes'
  ) THEN
    ALTER TABLE user_invitations ADD COLUMN admin_notes text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_invitations' AND column_name = 'first_name'
  ) THEN
    ALTER TABLE user_invitations ADD COLUMN first_name text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_invitations' AND column_name = 'last_name'
  ) THEN
    ALTER TABLE user_invitations ADD COLUMN last_name text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_invitations' AND column_name = 'business_name'
  ) THEN
    ALTER TABLE user_invitations ADD COLUMN business_name text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_invitations' AND column_name = 'phone_number'
  ) THEN
    ALTER TABLE user_invitations ADD COLUMN phone_number text;
  END IF;
END $$;

-- Create index for user_id lookups
CREATE INDEX IF NOT EXISTS idx_user_invitations_user_id ON user_invitations(user_id);

-- Add comment explaining the workflow
COMMENT ON COLUMN user_invitations.user_id IS 'Reference to pre-created user account awaiting password setup via invitation';
COMMENT ON COLUMN user_invitations.billing_plan IS 'Billing plan to be applied when invitation is accepted';
COMMENT ON COLUMN user_invitations.rate_per_minute_cents IS 'Custom rate per minute in cents for pay_per_use plans';
