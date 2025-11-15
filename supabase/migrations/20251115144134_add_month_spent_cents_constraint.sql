/*
  # Fix Negative Accrued Usage Cost

  1. Changes
    - Add CHECK constraint to ensure month_spent_cents cannot be negative
    - Update any existing negative values to 0
  
  2. Security
    - No RLS changes needed
*/

-- First, fix any existing negative values
UPDATE billing_accounts
SET month_spent_cents = 0
WHERE month_spent_cents < 0;

-- Add CHECK constraint to prevent future negative values
ALTER TABLE billing_accounts
ADD CONSTRAINT month_spent_cents_non_negative 
CHECK (month_spent_cents >= 0);
