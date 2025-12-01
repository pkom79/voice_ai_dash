-- Add usage_type column to usage_logs
ALTER TABLE usage_logs ADD COLUMN IF NOT EXISTS usage_type text;

-- Make rate_at_time_cents nullable to prevent errors if not provided
ALTER TABLE usage_logs ALTER COLUMN rate_at_time_cents DROP NOT NULL;

-- Reload schema cache
NOTIFY pgrst, 'reload config';
