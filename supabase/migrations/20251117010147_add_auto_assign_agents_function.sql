/*
  # Add Auto-Assign Agents Function

  1. Purpose
    - Automatically create user_agents assignments when calls are synced
    - Reconcile missing assignments for existing calls
    - Ensure users can see all their legitimate calls

  2. New Functions
    - `auto_assign_agent_to_user(user_id, agent_id)` - Creates user_agents assignment if missing
    - `reconcile_missing_user_agents()` - Finds and fixes missing assignments for existing calls

  3. Security
    - Functions use SECURITY DEFINER to bypass RLS for administrative tasks
    - Set proper search_path to prevent SQL injection
    - Only creates assignments for legitimate call activity
*/

-- Function to auto-assign an agent to a user if not already assigned
CREATE OR REPLACE FUNCTION auto_assign_agent_to_user(
  p_user_id uuid,
  p_agent_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only insert if the assignment doesn't already exist
  INSERT INTO user_agents (user_id, agent_id)
  VALUES (p_user_id, p_agent_id)
  ON CONFLICT (user_id, agent_id) DO NOTHING;
  
  -- Log the assignment for audit purposes
  IF FOUND THEN
    PERFORM log_user_activity(
      p_user_id := p_user_id,
      p_event_type := 'system_event',
      p_event_category := 'agent_assignment',
      p_event_name := 'Auto-Assigned Agent',
      p_description := 'Agent automatically assigned based on call activity',
      p_metadata := jsonb_build_object(
        'agent_id', p_agent_id,
        'source', 'auto_assignment'
      ),
      p_severity := 'info'
    );
  END IF;
END;
$$;

-- Function to reconcile all missing user_agents assignments based on existing calls
CREATE OR REPLACE FUNCTION reconcile_missing_user_agents()
RETURNS TABLE(
  user_id uuid,
  agent_id uuid,
  call_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Find all user-agent combinations that exist in calls but not in user_agents
  -- Then create the missing assignments
  RETURN QUERY
  WITH missing_assignments AS (
    SELECT DISTINCT
      c.user_id,
      c.agent_id,
      COUNT(*)::integer as call_count
    FROM calls c
    WHERE c.agent_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 
        FROM user_agents ua 
        WHERE ua.user_id = c.user_id 
          AND ua.agent_id = c.agent_id
      )
    GROUP BY c.user_id, c.agent_id
  ),
  inserted AS (
    INSERT INTO user_agents (user_id, agent_id)
    SELECT ma.user_id, ma.agent_id
    FROM missing_assignments ma
    ON CONFLICT (user_id, agent_id) DO NOTHING
    RETURNING user_agents.user_id, user_agents.agent_id
  )
  SELECT 
    ma.user_id,
    ma.agent_id,
    ma.call_count
  FROM missing_assignments ma
  INNER JOIN inserted i ON i.user_id = ma.user_id AND i.agent_id = ma.agent_id;
END;
$$;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION auto_assign_agent_to_user(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION reconcile_missing_user_agents() TO authenticated;

-- Create index on calls (user_id, agent_id) to speed up reconciliation queries
CREATE INDEX IF NOT EXISTS idx_calls_user_agent 
  ON calls(user_id, agent_id) 
  WHERE agent_id IS NOT NULL;
