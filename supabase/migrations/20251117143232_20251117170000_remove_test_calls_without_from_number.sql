/*
  # Remove Test Calls Without From Number

  1. Purpose
    - Delete all test calls that have no valid "from_number"
    - These are test calls that should never appear in the dashboard

  2. Changes
    - Delete calls where from_number is null or empty string
    - This cleanup ensures only real calls with valid phone numbers are shown

  3. Security
    - Admin-only operation, executed via migration
*/

-- Delete all calls without a valid from_number (these are test calls)
DELETE FROM calls
WHERE from_number IS NULL
   OR from_number = ''
   OR TRIM(from_number) = '';
