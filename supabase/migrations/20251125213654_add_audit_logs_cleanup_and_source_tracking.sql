-- Migration: Add 90-day cleanup for audit_logs and source tracking
-- This aligns audit_logs retention with user_activity_logs (90 days)
-- Also adds source column to track where events originated (manual, auto, github_action)

-- Add source column to track event origin
ALTER TABLE audit_logs 
ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual';

-- Add severity column for consistency with activity logs
ALTER TABLE audit_logs 
ADD COLUMN IF NOT EXISTS severity text DEFAULT 'info' 
CHECK (severity IN ('info', 'warning', 'error', 'critical'));

-- Add index on source for filtering
CREATE INDEX IF NOT EXISTS idx_audit_logs_source ON audit_logs(source);

-- Add index on action for filtering
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

-- Update existing cleanup function to include audit_logs
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
    
  -- Delete audit logs older than 90 days
  DELETE FROM audit_logs
  WHERE created_at < now() - INTERVAL '90 days';
END;
$$;

-- Add comment explaining the cleanup policy
COMMENT ON FUNCTION cleanup_old_activity_logs() IS 
  'Cleans up logs older than 90 days from user_activity_logs, user_connection_events, user_integration_errors (resolved only), and audit_logs. Should be run daily via scheduled job.';

-- Add source column to user_activity_logs for tracking auto vs manual events
ALTER TABLE user_activity_logs 
ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual';

-- Add source column to user_connection_events for tracking auto vs manual events  
ALTER TABLE user_connection_events 
ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual';

-- Add indexes for source filtering
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_source ON user_activity_logs(source);
CREATE INDEX IF NOT EXISTS idx_user_connection_events_source ON user_connection_events(source);

-- Update log_user_activity function to accept source parameter
CREATE OR REPLACE FUNCTION log_user_activity(
  p_user_id uuid,
  p_event_type text,
  p_event_category text,
  p_event_name text,
  p_description text,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_severity text DEFAULT 'info',
  p_created_by uuid DEFAULT NULL,
  p_source text DEFAULT 'manual'
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
    created_by,
    source
  ) VALUES (
    p_user_id,
    p_event_type,
    p_event_category,
    p_event_name,
    p_description,
    p_metadata,
    p_severity,
    p_created_by,
    p_source
  )
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$;

-- Update log_connection_event function to accept source parameter
CREATE OR REPLACE FUNCTION log_connection_event(
  p_user_id uuid,
  p_event_type text,
  p_location_id text DEFAULT NULL,
  p_location_name text DEFAULT NULL,
  p_token_expires_at timestamptz DEFAULT NULL,
  p_error_message text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_created_by uuid DEFAULT NULL,
  p_source text DEFAULT 'manual'
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
    created_by,
    source
  ) VALUES (
    p_user_id,
    p_event_type,
    p_location_id,
    p_location_name,
    p_token_expires_at,
    p_error_message,
    p_metadata,
    p_created_by,
    p_source
  )
  RETURNING id INTO v_event_id;
  
  RETURN v_event_id;
END;
$$;

-- Update log_admin_action function to accept source and severity
CREATE OR REPLACE FUNCTION log_admin_action(
  p_action text,
  p_target_user_id uuid DEFAULT NULL,
  p_details jsonb DEFAULT '{}',
  p_source text DEFAULT 'manual',
  p_severity text DEFAULT 'info'
)
RETURNS uuid AS $$
DECLARE
  v_audit_id uuid;
BEGIN
  INSERT INTO audit_logs (admin_user_id, action, target_user_id, details, source, severity)
  VALUES (auth.uid(), p_action, p_target_user_id, p_details, p_source, p_severity)
  RETURNING id INTO v_audit_id;
  RETURN v_audit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Allow service role to insert audit logs (for edge functions/GitHub Actions)
DROP POLICY IF EXISTS "Service role can insert audit logs" ON audit_logs;
CREATE POLICY "Service role can insert audit logs"
  ON audit_logs FOR INSERT
  TO service_role
  WITH CHECK (true);
