/*
  # Add User Activity Tracking System

  ## Overview
  Comprehensive activity tracking system for monitoring user actions, connection events,
  integration errors, and system-triggered events. Admin-only visibility with 90-day retention policy.

  ## New Tables Created

  ### 1. user_activity_logs
  Main activity log table tracking all user and system events:
  - `id` (uuid, primary key)
  - `user_id` (uuid, references users) - User the activity is associated with
  - `event_type` (text) - Type of event: 'user_action', 'connection_event', 'integration_error', 'system_event', 'admin_action'
  - `event_category` (text) - Specific category: 'login', 'profile_update', 'oauth_connect', 'oauth_disconnect', 'token_refresh', 'sync', 'billing', 'notification', 'api_error', etc.
  - `event_name` (text) - Short name for the event
  - `description` (text) - Human-readable description of the event
  - `metadata` (jsonb) - Additional event details including API request/response data
  - `ip_address` (text) - IP address of the user (if applicable)
  - `user_agent` (text) - Browser/client user agent (if applicable)
  - `severity` (text) - Event severity: 'info', 'warning', 'error', 'critical'
  - `created_at` (timestamptz) - When the event occurred
  - `created_by` (uuid, references users) - Admin who triggered the action (for admin actions)

  ### 2. user_connection_events
  Specialized table for tracking OAuth connection lifecycle:
  - `id` (uuid, primary key)
  - `user_id` (uuid, references users) - User whose connection changed
  - `event_type` (text) - 'connected', 'disconnected', 'token_refreshed', 'token_expired', 'refresh_failed'
  - `location_id` (text) - HighLevel location ID
  - `location_name` (text) - HighLevel location name
  - `token_expires_at` (timestamptz) - When the token expires (if applicable)
  - `error_message` (text) - Error message for failed operations
  - `metadata` (jsonb) - Additional connection details
  - `created_at` (timestamptz)
  - `created_by` (uuid, references users) - Admin who initiated the connection

  ### 3. user_integration_errors
  Detailed error logging for integration issues:
  - `id` (uuid, primary key)
  - `user_id` (uuid, references users) - User experiencing the error
  - `error_type` (text) - 'api_call_failed', 'sync_error', 'agent_assignment_error', 'billing_sync_error', etc.
  - `error_source` (text) - Where the error occurred: 'highlevel_api', 'stripe_api', 'internal_sync', etc.
  - `error_message` (text) - Error message
  - `error_code` (text) - Error code if available
  - `request_data` (jsonb) - API request details for debugging
  - `response_data` (jsonb) - API response details for debugging
  - `stack_trace` (text) - Stack trace if available
  - `retry_count` (integer) - Number of retry attempts
  - `resolved` (boolean) - Whether the error has been resolved
  - `resolved_at` (timestamptz) - When the error was resolved
  - `created_at` (timestamptz)

  ## Indexes
  - Optimized indexes for user_id, created_at, event_type, and severity for fast queries
  - Index on resolved status for integration errors

  ## Security
  - Enable RLS on all tables
  - Admin-only access for all activity logs
  - Service role can insert logs programmatically

  ## Retention Policy
  - Automatic cleanup of logs older than 90 days via scheduled function
*/

-- Create user_activity_logs table
CREATE TABLE IF NOT EXISTS user_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('user_action', 'connection_event', 'integration_error', 'system_event', 'admin_action')),
  event_category text NOT NULL,
  event_name text NOT NULL,
  description text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  ip_address text,
  user_agent text,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL
);

-- Create user_connection_events table
CREATE TABLE IF NOT EXISTS user_connection_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('connected', 'disconnected', 'token_refreshed', 'token_expired', 'refresh_failed', 'connection_attempted')),
  location_id text,
  location_name text,
  token_expires_at timestamptz,
  error_message text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL
);

-- Create user_integration_errors table
CREATE TABLE IF NOT EXISTS user_integration_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  error_type text NOT NULL,
  error_source text NOT NULL,
  error_message text NOT NULL,
  error_code text,
  request_data jsonb DEFAULT '{}'::jsonb,
  response_data jsonb DEFAULT '{}'::jsonb,
  stack_trace text,
  retry_count integer DEFAULT 0,
  resolved boolean DEFAULT false,
  resolved_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON user_activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON user_activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_event_type ON user_activity_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_activity_logs_event_category ON user_activity_logs(event_category);
CREATE INDEX IF NOT EXISTS idx_activity_logs_severity ON user_activity_logs(severity);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_created ON user_activity_logs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_connection_events_user_id ON user_connection_events(user_id);
CREATE INDEX IF NOT EXISTS idx_connection_events_created_at ON user_connection_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_connection_events_event_type ON user_connection_events(event_type);
CREATE INDEX IF NOT EXISTS idx_connection_events_user_created ON user_connection_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_integration_errors_user_id ON user_integration_errors(user_id);
CREATE INDEX IF NOT EXISTS idx_integration_errors_created_at ON user_integration_errors(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_integration_errors_resolved ON user_integration_errors(resolved);
CREATE INDEX IF NOT EXISTS idx_integration_errors_error_type ON user_integration_errors(error_type);
CREATE INDEX IF NOT EXISTS idx_integration_errors_user_created ON user_integration_errors(user_id, created_at DESC);

-- Enable Row Level Security
ALTER TABLE user_activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_connection_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_integration_errors ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_activity_logs (Admin-only access)
CREATE POLICY "Only admins can view activity logs"
  ON user_activity_logs FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Only admins and service role can insert activity logs"
  ON user_activity_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Service role can insert activity logs"
  ON user_activity_logs FOR INSERT
  TO service_role
  WITH CHECK (true);

-- RLS Policies for user_connection_events (Admin-only access)
CREATE POLICY "Only admins can view connection events"
  ON user_connection_events FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Only admins and service role can insert connection events"
  ON user_connection_events FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Service role can insert connection events"
  ON user_connection_events FOR INSERT
  TO service_role
  WITH CHECK (true);

-- RLS Policies for user_integration_errors (Admin-only access)
CREATE POLICY "Only admins can view integration errors"
  ON user_integration_errors FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Only admins can update integration errors"
  ON user_integration_errors FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Only admins and service role can insert integration errors"
  ON user_integration_errors FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Service role can insert integration errors"
  ON user_integration_errors FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Function to cleanup old activity logs (90-day retention)
CREATE OR REPLACE FUNCTION cleanup_old_activity_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Delete activity logs older than 90 days
  DELETE FROM user_activity_logs
  WHERE created_at < now() - INTERVAL '90 days';
  
  -- Delete connection events older than 90 days
  DELETE FROM user_connection_events
  WHERE created_at < now() - INTERVAL '90 days';
  
  -- Delete resolved integration errors older than 90 days
  DELETE FROM user_integration_errors
  WHERE created_at < now() - INTERVAL '90 days'
    AND resolved = true;
END;
$$;

-- Function to log activity events (callable from edge functions)
CREATE OR REPLACE FUNCTION log_user_activity(
  p_user_id uuid,
  p_event_type text,
  p_event_category text,
  p_event_name text,
  p_description text,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_severity text DEFAULT 'info',
  p_created_by uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log_id uuid;
BEGIN
  INSERT INTO user_activity_logs (
    user_id,
    event_type,
    event_category,
    event_name,
    description,
    metadata,
    severity,
    created_by
  ) VALUES (
    p_user_id,
    p_event_type,
    p_event_category,
    p_event_name,
    p_description,
    p_metadata,
    p_severity,
    p_created_by
  ) RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$;

-- Function to log connection events
CREATE OR REPLACE FUNCTION log_connection_event(
  p_user_id uuid,
  p_event_type text,
  p_location_id text DEFAULT NULL,
  p_location_name text DEFAULT NULL,
  p_token_expires_at timestamptz DEFAULT NULL,
  p_error_message text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_created_by uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id uuid;
BEGIN
  INSERT INTO user_connection_events (
    user_id,
    event_type,
    location_id,
    location_name,
    token_expires_at,
    error_message,
    metadata,
    created_by
  ) VALUES (
    p_user_id,
    p_event_type,
    p_location_id,
    p_location_name,
    p_token_expires_at,
    p_error_message,
    p_metadata,
    p_created_by
  ) RETURNING id INTO v_event_id;
  
  RETURN v_event_id;
END;
$$;

-- Function to log integration errors
CREATE OR REPLACE FUNCTION log_integration_error(
  p_user_id uuid,
  p_error_type text,
  p_error_source text,
  p_error_message text,
  p_error_code text DEFAULT NULL,
  p_request_data jsonb DEFAULT '{}'::jsonb,
  p_response_data jsonb DEFAULT '{}'::jsonb,
  p_stack_trace text DEFAULT NULL,
  p_retry_count integer DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_error_id uuid;
BEGIN
  INSERT INTO user_integration_errors (
    user_id,
    error_type,
    error_source,
    error_message,
    error_code,
    request_data,
    response_data,
    stack_trace,
    retry_count
  ) VALUES (
    p_user_id,
    p_error_type,
    p_error_source,
    p_error_message,
    p_error_code,
    p_request_data,
    p_response_data,
    p_stack_trace,
    p_retry_count
  ) RETURNING id INTO v_error_id;
  
  RETURN v_error_id;
END;
$$;
