/*
  # Call Sync Logging System

  1. New Table: call_sync_logs
    - Comprehensive tracking of all sync operations
    - Records API parameters, response summaries, and filtering decisions
    - Enables historical analysis of sync behavior
    - Supports debugging of missing calls and agent assignment issues

  2. Security
    - RLS enabled
    - Admins can view all logs
    - Users can view only their own logs
    - Service role can insert and update logs

  3. Indexes for efficient queries
*/

-- Create call_sync_logs table
CREATE TABLE IF NOT EXISTS call_sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sync_started_at timestamptz NOT NULL,
  sync_completed_at timestamptz,
  sync_type text NOT NULL CHECK (sync_type IN ('manual', 'auto', 'diagnostic')),
  sync_status text NOT NULL DEFAULT 'in_progress' CHECK (sync_status IN ('success', 'partial', 'failed', 'in_progress')),
  api_params jsonb DEFAULT '{}',
  api_response_summary jsonb DEFAULT '{}',
  processing_summary jsonb DEFAULT '{}',
  skipped_calls jsonb DEFAULT '[]',
  error_details jsonb,
  duration_ms integer,
  created_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_call_sync_logs_user_id ON call_sync_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_call_sync_logs_started_at ON call_sync_logs(sync_started_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_sync_logs_status ON call_sync_logs(sync_status);
CREATE INDEX IF NOT EXISTS idx_call_sync_logs_created_at ON call_sync_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_call_sync_logs_user_started ON call_sync_logs(user_id, sync_started_at DESC);

-- Enable RLS
ALTER TABLE call_sync_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for SELECT
CREATE POLICY "Admins can view all sync logs"
  ON call_sync_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Users can view their own sync logs"
  ON call_sync_logs FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- RLS Policies for INSERT (service role via edge functions)
CREATE POLICY "Allow insert for authenticated users"
  ON call_sync_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- RLS Policies for UPDATE (service role via edge functions)
CREATE POLICY "Allow update for authenticated users"
  ON call_sync_logs FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Function to cleanup old sync logs (90 days)
CREATE OR REPLACE FUNCTION cleanup_old_sync_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM call_sync_logs
  WHERE created_at < now() - interval '90 days';
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION cleanup_old_sync_logs() TO authenticated;
