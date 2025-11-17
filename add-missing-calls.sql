/*
  Helper Script to Add Missing Freddie Torres Calls

  INSTRUCTIONS:
  1. Replace the CALL_ID_HERE placeholders with the actual HighLevel call IDs
  2. Verify the user_id matches the correct user
  3. Adjust timestamps, durations, and costs based on actual call data
  4. Run this script via Supabase SQL editor or mcp__supabase__execute_sql

  CURRENT FINDINGS:
  - Agent: "Agent - ENG" (ID: cc36c1d3-2989-4d38-87cc-a44a17dbb825)
  - Phone: +17729791002 (needs to be added to phone_numbers table first if not exists)
  - Contact: "Freddie Torres"
  - Date: Nov 4, 2025
  - Times: 9:21 AM, 9:27 AM, 9:29 AM, 9:31 AM (UTC timestamps need conversion)
  - Direction: inbound (based on screenshot)

  MISSING DATA TO FILL IN:
  - highlevel_call_id (4 IDs needed)
  - user_id (which user do these calls belong to?)
  - duration_seconds (visible in screenshot)
  - cost (visible in screenshot)
*/

-- First, get the Agent - ENG agent_id
DO $$
DECLARE
  v_agent_id uuid;
  v_user_id uuid;
  v_phone_number_id uuid;
BEGIN
  -- Get agent ID
  SELECT id INTO v_agent_id
  FROM agents
  WHERE name = 'Agent - ENG'
  LIMIT 1;

  RAISE NOTICE 'Agent ID: %', v_agent_id;

  -- TODO: Determine which user these calls belong to
  -- Replace USER_EMAIL_HERE with the actual user's email
  -- SELECT id INTO v_user_id FROM users WHERE email = 'USER_EMAIL_HERE';

  -- Check if phone number exists, if not create it
  SELECT id INTO v_phone_number_id
  FROM phone_numbers
  WHERE phone_number = '+17729791002';

  IF v_phone_number_id IS NULL THEN
    RAISE NOTICE 'Phone number +17729791002 not found in database';
    RAISE NOTICE 'You may need to add it first or leave phone_number_id as NULL';
  ELSE
    RAISE NOTICE 'Phone number ID: %', v_phone_number_id;
  END IF;

END $$;

-- Template for inserting the 4 missing calls
-- Uncomment and fill in the values once you have the call IDs

/*
-- Call 1: 9:21 AM
INSERT INTO calls (
  highlevel_call_id,
  user_id,
  agent_id,
  phone_number_id,
  direction,
  contact_name,
  from_number,
  to_number,
  duration_seconds,
  cost,
  display_cost,
  is_test_call,
  call_started_at
) VALUES (
  'CALL_ID_1_HERE',  -- Replace with actual call ID
  'USER_ID_HERE',     -- Replace with actual user UUID
  (SELECT id FROM agents WHERE name = 'Agent - ENG'),
  (SELECT id FROM phone_numbers WHERE phone_number = '+17729791002'),
  'inbound',
  'Freddie Torres',
  '+17729791002',
  '',  -- Fill in if known
  0,   -- Replace with actual duration from screenshot
  0.00, -- Replace with actual cost from screenshot
  NULL,
  false,
  '2025-11-04 09:21:00+00'  -- Adjust timezone if needed
);

-- Call 2: 9:27 AM
INSERT INTO calls (
  highlevel_call_id,
  user_id,
  agent_id,
  phone_number_id,
  direction,
  contact_name,
  from_number,
  to_number,
  duration_seconds,
  cost,
  display_cost,
  is_test_call,
  call_started_at
) VALUES (
  'CALL_ID_2_HERE',
  'USER_ID_HERE',
  (SELECT id FROM agents WHERE name = 'Agent - ENG'),
  (SELECT id FROM phone_numbers WHERE phone_number = '+17729791002'),
  'inbound',
  'Freddie Torres',
  '+17729791002',
  '',
  0,
  0.00,
  NULL,
  false,
  '2025-11-04 09:27:00+00'
);

-- Call 3: 9:29 AM
INSERT INTO calls (
  highlevel_call_id,
  user_id,
  agent_id,
  phone_number_id,
  direction,
  contact_name,
  from_number,
  to_number,
  duration_seconds,
  cost,
  display_cost,
  is_test_call,
  call_started_at
) VALUES (
  'CALL_ID_3_HERE',
  'USER_ID_HERE',
  (SELECT id FROM agents WHERE name = 'Agent - ENG'),
  (SELECT id FROM phone_numbers WHERE phone_number = '+17729791002'),
  'inbound',
  'Freddie Torres',
  '+17729791002',
  '',
  0,
  0.00,
  NULL,
  false,
  '2025-11-04 09:29:00+00'
);

-- Call 4: 9:31 AM
INSERT INTO calls (
  highlevel_call_id,
  user_id,
  agent_id,
  phone_number_id,
  direction,
  contact_name,
  from_number,
  to_number,
  duration_seconds,
  cost,
  display_cost,
  is_test_call,
  call_started_at
) VALUES (
  'CALL_ID_4_HERE',
  'USER_ID_HERE',
  (SELECT id FROM agents WHERE name = 'Agent - ENG'),
  (SELECT id FROM phone_numbers WHERE phone_number = '+17729791002'),
  'inbound',
  'Freddie Torres',
  '+17729791002',
  '',
  0,
  0.00,
  NULL,
  false,
  '2025-11-04 09:31:00+00'
);
*/

-- After inserting calls, create usage logs for any paid calls
/*
INSERT INTO usage_logs (user_id, call_id, cost_cents, usage_type, created_at)
SELECT
  user_id,
  id,
  ROUND(cost * 100)::integer,
  direction,
  call_started_at
FROM calls
WHERE highlevel_call_id IN ('CALL_ID_1_HERE', 'CALL_ID_2_HERE', 'CALL_ID_3_HERE', 'CALL_ID_4_HERE')
AND cost > 0;
*/
