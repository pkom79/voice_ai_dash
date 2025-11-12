/*
  # Make invited_by column nullable in user_invitations

  ## Changes
  - Alter user_invitations.invited_by to allow NULL values
  - This allows system-created invitations (via service role) to not require an inviting user
*/

ALTER TABLE user_invitations ALTER COLUMN invited_by DROP NOT NULL;
