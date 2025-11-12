/*
  # Add Agent-Phone Number Relationship System

  ## Overview
  This migration creates the infrastructure to track phone numbers assigned to agents,
  enabling filtered phone number dropdowns based on agent assignments.

  ## New Tables
  
  ### 1. agent_phone_numbers (junction table)
  - Links agents with their assigned phone numbers
  - Supports many-to-many relationship (agents can have multiple numbers via pools)
  - Tracks assignment metadata

  ## Table Modifications

  ### agents table
  - Add `highlevel_number_pool_id` - HighLevel number pool identifier
  - Add `inbound_phone_number` - Direct inbound phone number for agent

  ### phone_numbers table
  - Add `highlevel_phone_id` - HighLevel phone system identifier
  - Add `provider` - Phone provider (twilio, bandwidth, etc.)
  - Add `capabilities` - Phone capabilities (voice, sms, mms)

  ## Security
  - Enable RLS on agent_phone_numbers table
  - Users can view phone numbers assigned to their agents
  - Admins have full access to all agent-phone relationships

  ## Indexes
  - Performance indexes on junction table for quick lookups
  - Composite indexes for common query patterns
*/

-- Add new columns to agents table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'agents' AND column_name = 'highlevel_number_pool_id'
  ) THEN
    ALTER TABLE agents ADD COLUMN highlevel_number_pool_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'agents' AND column_name = 'inbound_phone_number'
  ) THEN
    ALTER TABLE agents ADD COLUMN inbound_phone_number text;
  END IF;
END $$;

-- Add new columns to phone_numbers table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'phone_numbers' AND column_name = 'highlevel_phone_id'
  ) THEN
    ALTER TABLE phone_numbers ADD COLUMN highlevel_phone_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'phone_numbers' AND column_name = 'provider'
  ) THEN
    ALTER TABLE phone_numbers ADD COLUMN provider text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'phone_numbers' AND column_name = 'capabilities'
  ) THEN
    ALTER TABLE phone_numbers ADD COLUMN capabilities jsonb DEFAULT '{"voice": true, "sms": false, "mms": false}'::jsonb;
  END IF;
END $$;

-- Create agent_phone_numbers junction table
CREATE TABLE IF NOT EXISTS agent_phone_numbers (
  agent_id uuid REFERENCES agents(id) ON DELETE CASCADE,
  phone_number_id uuid REFERENCES phone_numbers(id) ON DELETE CASCADE,
  assignment_source text DEFAULT 'direct' CHECK (assignment_source IN ('direct', 'pool', 'manual')),
  assigned_at timestamptz DEFAULT now(),
  PRIMARY KEY (agent_id, phone_number_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_agent_phone_numbers_agent_id ON agent_phone_numbers(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_phone_numbers_phone_number_id ON agent_phone_numbers(phone_number_id);
CREATE INDEX IF NOT EXISTS idx_agents_number_pool_id ON agents(highlevel_number_pool_id);
CREATE INDEX IF NOT EXISTS idx_agents_inbound_phone ON agents(inbound_phone_number);
CREATE INDEX IF NOT EXISTS idx_phone_numbers_highlevel_id ON phone_numbers(highlevel_phone_id);

-- Enable RLS on agent_phone_numbers
ALTER TABLE agent_phone_numbers ENABLE ROW LEVEL SECURITY;

-- RLS Policies for agent_phone_numbers

-- Users can view phone numbers assigned to their agents
CREATE POLICY "Users can view assigned agent phone numbers"
  ON agent_phone_numbers FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM user_agents 
      WHERE user_agents.user_id = auth.uid() 
      AND user_agents.agent_id = agent_phone_numbers.agent_id
    )
  );

-- Admins can manage all agent-phone relationships
CREATE POLICY "Admins can manage agent phone numbers"
  ON agent_phone_numbers FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));
