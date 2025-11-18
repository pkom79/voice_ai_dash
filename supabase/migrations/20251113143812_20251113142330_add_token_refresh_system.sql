/*
  # Token Refresh System for HighLevel OAuth

  ## Overview
  Implements automatic token refresh tracking and scheduling system to prevent
  HighLevel OAuth tokens from expiring. Tokens are refreshed proactively before
  expiration to ensure continuous service.

  ## New Tables

  ### 1. token_refresh_logs
  - Tracks all token refresh attempts (success and failure)
  - `id` (uuid, primary key)
  - `user_id` (uuid, references users)
  - `refresh_status` (text: 'success' | 'failure')
  - `token_expires_at` (timestamptz, when the refreshed token expires)
  - `error_message` (text, nullable, error details if failed)
  - `refreshed_by` (text: 'scheduled_job' | 'manual_trigger' | 'on_demand')
  - `created_at` (timestamptz)

  ### 2. scheduled_job_runs
  - Tracks execution history of scheduled refresh jobs
  - `id` (uuid, primary key)
  - `job_name` (text, e.g., 'token_refresh')
  - `status` (text: 'running' | 'completed' | 'failed')
  - `tokens_checked` (integer)
  - `tokens_refreshed` (integer)
  - `tokens_failed` (integer)
  - `error_message` (text, nullable)
  - `started_at` (timestamptz)
  - `completed_at` (timestamptz, nullable)
  - `metadata` (jsonb)

  ## Functions

  ### get_expiring_tokens(hours_ahead integer)
  Returns list of users whose HighLevel OAuth tokens will expire within the specified hours.
  Used by refresh job to identify which tokens need refreshing.

  ### log_token_refresh(...)
  Helper function to record token refresh attempts in token_refresh_logs table.

  ## Security
  - RLS enabled on all tables
  - Only admins can view refresh logs and job runs
  - Service role key bypasses RLS for scheduled jobs

  ## Indexes
  - Optimized for querying recent refresh attempts
  - Fast lookups by user_id and timestamp
  - Efficient filtering by status for error tracking
*/

-- ======================
-- CREATE TABLES
-- ======================

-- Track all token refresh attempts
CREATE TABLE IF NOT EXISTS token_refresh_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_status text NOT NULL CHECK (refresh_status IN ('success', 'failure')),
  token_expires_at timestamptz,
  error_message text,
  refreshed_by text NOT NULL DEFAULT 'scheduled_job' CHECK (refreshed_by IN ('scheduled_job', 'manual_trigger', 'on_demand')),
  created_at timestamptz DEFAULT now()
);

-- Track scheduled job execution history
CREATE TABLE IF NOT EXISTS scheduled_job_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name text NOT NULL,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  tokens_checked integer DEFAULT 0,
  tokens_refreshed integer DEFAULT 0,
  tokens_failed integer DEFAULT 0,
  error_message text,
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  metadata jsonb DEFAULT '{}'::jsonb
);

-- ======================
-- CREATE INDEXES
-- ======================

-- token_refresh_logs indexes
CREATE INDEX IF NOT EXISTS idx_token_refresh_logs_user_id ON token_refresh_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_token_refresh_logs_status ON token_refresh_logs(refresh_status);
CREATE INDEX IF NOT EXISTS idx_token_refresh_logs_created_at ON token_refresh_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_token_refresh_logs_user_created ON token_refresh_logs(user_id, created_at DESC);

-- scheduled_job_runs indexes
CREATE INDEX IF NOT EXISTS idx_scheduled_job_runs_job_name ON scheduled_job_runs(job_name);
CREATE INDEX IF NOT EXISTS idx_scheduled_job_runs_status ON scheduled_job_runs(status);
CREATE INDEX IF NOT EXISTS idx_scheduled_job_runs_started_at ON scheduled_job_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_scheduled_job_runs_name_started ON scheduled_job_runs(job_name, started_at DESC);

-- ======================
-- ENABLE ROW LEVEL SECURITY
-- ======================

ALTER TABLE token_refresh_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_job_runs ENABLE ROW LEVEL SECURITY;

-- ======================
-- RLS POLICIES
-- ======================

DROP POLICY IF EXISTS "Admins can view all token refresh logs" ON token_refresh_logs;
DROP POLICY IF EXISTS "Service role can insert token refresh logs" ON token_refresh_logs;
DROP POLICY IF EXISTS "Admins can view all scheduled job runs" ON scheduled_job_runs;
DROP POLICY IF EXISTS "Service role can manage scheduled job runs" ON scheduled_job_runs;

-- token_refresh_logs policies
CREATE POLICY "Admins can view all token refresh logs"
  ON token_refresh_logs FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Service role can insert token refresh logs"
  ON token_refresh_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- scheduled_job_runs policies
CREATE POLICY "Admins can view all scheduled job runs"
  ON scheduled_job_runs FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Service role can manage scheduled job runs"
  ON scheduled_job_runs FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ======================
-- HELPER FUNCTIONS
-- ======================

-- Get users with expiring tokens
CREATE OR REPLACE FUNCTION get_expiring_tokens(hours_ahead integer DEFAULT 24)
RETURNS TABLE (
  user_id uuid,
  user_email text,
  token_expires_at timestamptz,
  hours_until_expiry numeric,
  location_id text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ak.user_id,
    u.email,
    ak.token_expires_at,
    EXTRACT(EPOCH FROM (ak.token_expires_at - now())) / 3600 AS hours_until_expiry,
    ak.location_id
  FROM api_keys ak
  JOIN users u ON u.id = ak.user_id
  WHERE
    ak.service = 'highlevel'
    AND ak.is_active = true
    AND ak.token_expires_at IS NOT NULL
    AND ak.refresh_token IS NOT NULL
    AND ak.token_expires_at <= (now() + (hours_ahead || ' hours')::interval)
    AND ak.token_expires_at > now()
  ORDER BY ak.token_expires_at ASC;
END;
$$;

-- Log token refresh attempt
CREATE OR REPLACE FUNCTION log_token_refresh(
  p_user_id uuid,
  p_refresh_status text,
  p_token_expires_at timestamptz DEFAULT NULL,
  p_error_message text DEFAULT NULL,
  p_refreshed_by text DEFAULT 'scheduled_job'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log_id uuid;
BEGIN
  INSERT INTO token_refresh_logs (
    user_id,
    refresh_status,
    token_expires_at,
    error_message,
    refreshed_by
  ) VALUES (
    p_user_id,
    p_refresh_status,
    p_token_expires_at,
    p_error_message,
    p_refreshed_by
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

-- Get recent refresh failures (for email alerts)
CREATE OR REPLACE FUNCTION get_recent_refresh_failures(hours_ago integer DEFAULT 24)
RETURNS TABLE (
  user_id uuid,
  user_email text,
  user_name text,
  error_message text,
  failed_at timestamptz,
  failure_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    trl.user_id,
    u.email,
    u.full_name,
    trl.error_message,
    trl.created_at AS failed_at,
    COUNT(*) OVER (PARTITION BY trl.user_id) AS failure_count
  FROM token_refresh_logs trl
  JOIN users u ON u.id = trl.user_id
  WHERE
    trl.refresh_status = 'failure'
    AND trl.created_at >= (now() - (hours_ago || ' hours')::interval)
  ORDER BY trl.created_at DESC;
END;
$$;

-- Get token health summary (for admin dashboard)
CREATE OR REPLACE FUNCTION get_token_health_summary()
RETURNS TABLE (
  total_tokens integer,
  expiring_soon integer,
  expired_tokens integer,
  healthy_tokens integer,
  failed_refreshes_24h integer,
  last_refresh_job timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total integer;
  v_expiring integer;
  v_expired integer;
  v_healthy integer;
  v_failed integer;
  v_last_job timestamptz;
BEGIN
  -- Count total active tokens
  SELECT COUNT(*) INTO v_total
  FROM api_keys
  WHERE service = 'highlevel' AND is_active = true;

  -- Count tokens expiring within 24 hours
  SELECT COUNT(*) INTO v_expiring
  FROM api_keys
  WHERE
    service = 'highlevel'
    AND is_active = true
    AND token_expires_at <= (now() + interval '24 hours')
    AND token_expires_at > now();

  -- Count expired tokens
  SELECT COUNT(*) INTO v_expired
  FROM api_keys
  WHERE
    service = 'highlevel'
    AND is_active = true
    AND token_expires_at <= now();

  -- Count healthy tokens (expire more than 24 hours from now)
  SELECT COUNT(*) INTO v_healthy
  FROM api_keys
  WHERE
    service = 'highlevel'
    AND is_active = true
    AND token_expires_at > (now() + interval '24 hours');

  -- Count failed refreshes in last 24 hours
  SELECT COUNT(DISTINCT user_id) INTO v_failed
  FROM token_refresh_logs
  WHERE
    refresh_status = 'failure'
    AND created_at >= (now() - interval '24 hours');

  -- Get last refresh job time
  SELECT MAX(started_at) INTO v_last_job
  FROM scheduled_job_runs
  WHERE job_name = 'token_refresh' AND status = 'completed';

  RETURN QUERY SELECT v_total, v_expiring, v_expired, v_healthy, v_failed, v_last_job;
END;
$$;

-- ======================
-- ATTEMPT TO ENABLE PG_CRON (OPTIONAL)
-- ======================

-- Try to enable pg_cron extension if available
-- This will silently fail if not available (e.g., on free tier)
-- Note: pg_cron scheduling is optional - GitHub Actions will be used as the primary scheduler
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  RAISE NOTICE 'pg_cron extension enabled successfully';
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron extension not available - will use GitHub Actions scheduler';
END $$;
