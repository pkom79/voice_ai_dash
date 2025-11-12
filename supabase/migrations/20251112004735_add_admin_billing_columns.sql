/*
  # Add Admin Billing Configuration Columns
  
  Adds missing columns to billing_accounts table that are needed for admin billing configuration:
  - admin_notes: Text field for admin notes about billing arrangements
  - custom_cost_per_minute: Custom per-minute rate override for specific users
  
  These columns are used by the Admin Billing Configuration modal.
*/

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