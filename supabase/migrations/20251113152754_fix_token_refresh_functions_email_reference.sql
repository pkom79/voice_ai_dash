/*
  # Fix Token Refresh Functions Email Reference

  ## Overview
  Corrects the token refresh system functions to properly reference user email 
  from auth.users table instead of public.users table (which doesn't have email column).

  ## Changes
  1. Updates `get_expiring_tokens` function to join with auth.users for email
  2. Updates `get_recent_refresh_failures` function to join with auth.users for email
  3. Maintains all other functionality and return types

  ## Security
  - Functions remain SECURITY DEFINER with search_path = public
  - Proper joins ensure data integrity
  - No changes to RLS policies needed
*/

-- Fix get_expiring_tokens function to use auth.users for email
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
    au.email::text,
    ak.token_expires_at,
    EXTRACT(EPOCH FROM (ak.token_expires_at - now())) / 3600 AS hours_until_expiry,
    ak.location_id
  FROM api_keys ak
  JOIN auth.users au ON au.id = ak.user_id
  WHERE
    ak.service = 'highlevel'
    AND ak.is_active = true
    AND ak.token_expires_at IS NOT NULL
    AND ak.refresh_token IS NOT NULL
    AND ak.token_expires_at <= (now() + (hours_ahead || ' hours')::interval)
    AND ak.token_expires_at > now() -- Not already expired
  ORDER BY ak.token_expires_at ASC;
END;
$$;

-- Fix get_recent_refresh_failures function to use auth.users for email
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
    au.email::text,
    u.full_name,
    trl.error_message,
    trl.created_at AS failed_at,
    COUNT(*) OVER (PARTITION BY trl.user_id) AS failure_count
  FROM token_refresh_logs trl
  JOIN auth.users au ON au.id = trl.user_id
  JOIN users u ON u.id = trl.user_id
  WHERE
    trl.refresh_status = 'failure'
    AND trl.created_at >= (now() - (hours_ago || ' hours')::interval)
  ORDER BY trl.created_at DESC;
END;
$$;
