/*
  # Call Sync Logging System

  1. New Table: call_sync_logs
    - Comprehensive tracking of all sync operations
    - Records API parameters, response summaries, and filtering decisions
    - Enables historical analysis of sync behavior
    - Supports debugging of missing calls and agent assignment issues

  2. Columns
    - id (uuid, primary key)
    - user_id (uuid, foreign key to users)
    - sync_started_at (timestamptz)
    - sync_completed_at (timestamptz)
    - sync_type (text) - 'manual', 'auto', 'diagnostic'
    - sync_status (text) - 'success', 'partial', 'failed'
    - api_params (jsonb) - Request parameters sent to HighLevel
    - api_response_summary (jsonb) - Metadata from API responses
    - processing_summary (jsonb) - Counts and statistics
    - skipped_calls (jsonb) - Detailed list of skipped calls with reasons
    - error_details (jsonb) - Any errors encountered
    - duration_ms (integer) - Total processing time
    - created_at (timestamptz)

  3. Security
    - RLS enabled
    - Admins can view all logs
    - Users can view only their own logs
    - Automatic cleanup of logs older than 90 days

  4. Indexes
    - user_id, sync_started_at for efficient queries
    - sync_status for filtering by outcome
    - created_at for cleanup operations
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

-- RLS Policies
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

CREATE POLICY "Service role can insert sync logs"
  ON call_sync_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Service role can update sync logs"
  ON call_sync_logs FOR UPDATE
  TO authenticated
  USING (true);

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

-- Comments
COMMENT ON TABLE call_sync_logs IS 'Tracks all call sync operations with detailed logging for diagnostics';
COMMENT ON COLUMN call_sync_logs.sync_type IS 'Type of sync: manual (user-triggered), auto (scheduled), diagnostic (comparison tool)';
COMMENT ON COLUMN call_sync_logs.sync_status IS 'Outcome: success (all good), partial (some skipped), failed (error occurred)';
COMMENT ON COLUMN call_sync_logs.api_params IS 'Parameters sent to HighLevel API: {startDate, endDate, locationId, limit, etc.}';
COMMENT ON COLUMN call_sync_logs.api_response_summary IS 'API response metadata: {totalFetched, pageCount, pagesDetails: [...], dateRangeCovered, etc.}';
COMMENT ON COLUMN call_sync_logs.processing_summary IS 'Processing statistics: {saved, skipped, errors, skipReasons: {unassigned_agent: N, missing_agent: N, ...}}';
COMMENT ON COLUMN call_sync_logs.skipped_calls IS 'Array of skipped call details: [{callId, agentId, reason, timestamp, fromNumber, contactName}, ...]';
COMMENT ON COLUMN call_sync_logs.error_details IS 'Error information if sync failed: {message, code, stack, etc.}';
COMMENT ON COLUMN call_sync_logs.duration_ms IS 'Total sync duration in milliseconds';
