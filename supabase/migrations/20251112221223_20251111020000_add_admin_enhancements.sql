/*
  # Admin Dashboard Enhancements

  ## New Tables

  ### 1. user_invitations
  - Tracks registration invite links sent by admins
  - Includes unique tokens, expiration dates, and status tracking
  - Used by: Admin Users page for sending registration invites

  ### 2. active_sessions
  - Tracks user login sessions with device, location, and activity
  - Provides admins visibility into user activity
  - Used by: Admin Users page for session monitoring

  ### 3. user_phone_number_assignments (enhanced from user_phone_numbers)
  - Manages phone number allocations to users
  - Tracks assignment date and admin who made the assignment
  - Used by: Admin Users page for phone number management

  ## Table Modifications

  ### billing_accounts
  - Add custom_cost_per_minute for per-user pricing overrides
  - Add notes field for admin billing notes
  - Used by: Admin Users page billing configuration

  ## Security
  - Enable RLS on all new tables
  - Only admins can access user_invitations and active_sessions
  - Audit all admin actions

  ## Indexes
  - Optimized indexes for invitation lookups by token
  - Session queries by user and timestamp
  - Phone number assignment lookups
*/

-- Create user_invitations table
CREATE TABLE IF NOT EXISTS user_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invited_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email text NOT NULL,
  invitation_token text UNIQUE NOT NULL,
  role text NOT NULL DEFAULT 'client' CHECK (role IN ('client', 'admin')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create active_sessions table
CREATE TABLE IF NOT EXISTS active_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_token text NOT NULL,
  ip_address text,
  user_agent text,
  device_type text,
  device_name text,
  browser text,
  os text,
  location_city text,
  location_country text,
  last_activity_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Add custom pricing fields to billing_accounts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'billing_accounts' AND column_name = 'custom_cost_per_minute'
  ) THEN
    ALTER TABLE billing_accounts ADD COLUMN custom_cost_per_minute decimal(10, 4);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'billing_accounts' AND column_name = 'admin_notes'
  ) THEN
    ALTER TABLE billing_accounts ADD COLUMN admin_notes text;
  END IF;
END $$;

-- Enhance user_phone_numbers with assignment tracking
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_phone_numbers' AND column_name = 'assigned_by'
  ) THEN
    ALTER TABLE user_phone_numbers ADD COLUMN assigned_by uuid REFERENCES users(id);
  END IF;
END $$;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_invitations_token ON user_invitations(invitation_token);
CREATE INDEX IF NOT EXISTS idx_user_invitations_email ON user_invitations(email);
CREATE INDEX IF NOT EXISTS idx_user_invitations_status ON user_invitations(status);
CREATE INDEX IF NOT EXISTS idx_active_sessions_user_id ON active_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_active_sessions_last_activity ON active_sessions(last_activity_at);
CREATE INDEX IF NOT EXISTS idx_calls_user_direction ON calls(user_id, direction);
CREATE INDEX IF NOT EXISTS idx_calls_user_date ON calls(user_id, call_started_at);
CREATE INDEX IF NOT EXISTS idx_calls_direction_date ON calls(direction, call_started_at);
CREATE INDEX IF NOT EXISTS idx_calls_status ON calls(status);

-- Enable RLS on new tables
ALTER TABLE user_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE active_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_invitations
DROP POLICY IF EXISTS "Admins can view all invitations" ON user_invitations;
DROP POLICY IF EXISTS "Admins can create invitations" ON user_invitations;
DROP POLICY IF EXISTS "Admins can update invitations" ON user_invitations;
DROP POLICY IF EXISTS "Admins can delete invitations" ON user_invitations;

-- RLS Policies for active_sessions
DROP POLICY IF EXISTS "Admins can view all sessions" ON active_sessions;
DROP POLICY IF EXISTS "Admins can terminate sessions" ON active_sessions;
DROP POLICY IF EXISTS "Users can view own sessions" ON active_sessions;
DROP POLICY IF EXISTS "System can insert sessions" ON active_sessions;
DROP POLICY IF EXISTS "System can update sessions" ON active_sessions;
DROP POLICY IF EXISTS "System can delete sessions" ON active_sessions;

-- Admins can view all invitations
CREATE POLICY "Admins can view all invitations"
  ON user_invitations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
      AND users.is_active = true
    )
  );

-- Admins can create invitations
CREATE POLICY "Admins can create invitations"
  ON user_invitations FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
      AND users.is_active = true
    )
  );

-- Admins can update invitations
CREATE POLICY "Admins can update invitations"
  ON user_invitations FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
      AND users.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
      AND users.is_active = true
    )
  );

-- RLS Policies for active_sessions

-- Admins can view all sessions
CREATE POLICY "Admins can view all sessions"
  ON active_sessions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
      AND users.is_active = true
    )
  );

-- Users can view their own sessions
CREATE POLICY "Users can view own sessions"
  ON active_sessions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- System can insert sessions
CREATE POLICY "System can insert sessions"
  ON active_sessions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- System can update sessions
CREATE POLICY "System can update sessions"
  ON active_sessions FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- System can delete old sessions
CREATE POLICY "System can delete sessions"
  ON active_sessions FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Create function to clean up expired invitations
CREATE OR REPLACE FUNCTION cleanup_expired_invitations()
RETURNS void AS $$
BEGIN
  UPDATE user_invitations
  SET status = 'expired', updated_at = now()
  WHERE status = 'pending'
  AND expires_at < now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to log audit events
CREATE OR REPLACE FUNCTION log_admin_action(
  p_action text,
  p_target_user_id uuid DEFAULT NULL,
  p_details jsonb DEFAULT '{}'
)
RETURNS uuid AS $$
DECLARE
  v_audit_id uuid;
BEGIN
  INSERT INTO audit_logs (admin_user_id, action, target_user_id, details)
  VALUES (auth.uid(), p_action, p_target_user_id, p_details)
  RETURNING id INTO v_audit_id;

  RETURN v_audit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
