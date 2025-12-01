import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface SyncCallsRequest {
  userId: string;
  startDate?: string;
  endDate?: string;
  syncType?: 'manual' | 'auto' | 'admin_historical';
  timezone?: string;
  adminOverride?: boolean;
  adminUserId?: string;
}

interface SyncLogger {
  logId: string;
  startTime: number;
  logs: string[];
  skippedCalls: any[];
  skipReasons: Record<string, number>;
  apiPages: any[];
}

type EdgeSupabaseClient = SupabaseClient<any, any, any>;

const HIGHLEVEL_BASE_URL = Deno.env.get("HIGHLEVEL_API_URL") || "https://services.leadconnectorhq.com";
type AgentPhoneNumbers = Record<string, { id: string; phone_number: string }[]>;

// Helper function to log activity events to the database
async function logActivityEvent(
  supabase: EdgeSupabaseClient,
  userId: string,
  eventName: string,
  description: string,
  metadata: Record<string, any> = {},
  severity: 'info' | 'warning' | 'error' | 'critical' = 'info',
  source: 'manual' | 'auto' | 'github_action' = 'manual'
) {
  try {
    await supabase.rpc('log_user_activity', {
      p_user_id: userId,
      p_event_type: 'system_event',
      p_event_category: 'sync',
      p_event_name: eventName,
      p_description: description,
      p_metadata: metadata,
      p_severity: severity,
      p_source: source,
    });
  } catch (error) {
    console.error('[SYNC] Failed to log activity event:', error);
  }
}

// Helper function to log integration errors
async function logIntegrationError(
  supabase: EdgeSupabaseClient,
  userId: string,
  errorType: string,
  errorMessage: string,
  errorCode: string | null = null,
  requestData: Record<string, any> = {},
  responseData: Record<string, any> = {}
) {
  try {
    await supabase.rpc('log_integration_error', {
      p_user_id: userId,
      p_error_type: errorType,
      p_error_source: 'highlevel_api',
      p_error_message: errorMessage,
      p_error_code: errorCode,
      p_request_data: requestData,
      p_response_data: responseData,
    });
  } catch (error) {
    console.error('[SYNC] Failed to log integration error:', error);
  }
}

const normalizePhoneNumberValue = (value?: string | null): string => {
  if (!value) return "";
  const digits = value.replace(/[^0-9]/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return digits.slice(1);
  }
  return digits;
};

const extractPhoneNumberValue = (entry: any): string | null => {
  if (!entry) return null;
  if (typeof entry === "string") return entry;
  return (
    entry.phone_number ||
    entry.phoneNumber ||
    entry.number ||
    entry.value ||
    entry.rawValue ||
    null
  );
};

const buildPhoneMetadataMap = (phoneEntries: any[]): Map<string, any> => {
  const map = new Map<string, any>();
  for (const entry of phoneEntries) {
    const value = extractPhoneNumberValue(entry);
    if (!value) continue;
    const normalized = normalizePhoneNumberValue(value);
    if (!normalized) continue;
    if (!map.has(normalized)) {
      map.set(normalized, entry);
    }
  }
  return map;
};

const deriveIsActiveFromMetadata = (metadata?: any): boolean | undefined => {
  if (!metadata) return undefined;
  if (typeof metadata.isActive === "boolean") return metadata.isActive;
  if (typeof metadata.active === "boolean") return metadata.active;
  if (typeof metadata.status === "string") {
    return metadata.status.toLowerCase() !== "inactive";
  }
  return undefined;
};

const deriveLabelFromMetadata = (metadata?: any): string | undefined => {
  if (!metadata) return undefined;
  return (
    metadata.label ||
    metadata.friendlyName ||
    metadata.name ||
    metadata.displayName ||
    metadata.description ||
    metadata.tagline
  );
};

const getHeaders = (accessToken: string): HeadersInit => ({
  "Authorization": `Bearer ${accessToken}`,
  "Content-Type": "application/json",
  "Version": "2021-07-28",
});

async function fetchLocationPhoneNumbers(accessToken: string, locationId: string): Promise<any[]> {
  const url = `${HIGHLEVEL_BASE_URL}/phone-system/numbers/location/${locationId}`;
  const response = await fetch(url, { headers: getHeaders(accessToken) });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch phone numbers (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.numbers)) return data.numbers;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

async function fetchNumberPools(accessToken: string, locationId: string): Promise<any[]> {
  const url = `${HIGHLEVEL_BASE_URL}/phone-system/number-pools?locationId=${locationId}`;
  const response = await fetch(url, { headers: getHeaders(accessToken) });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch number pools (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.pools)) return data.pools;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

async function fetchAgentDetailsFromHighLevel(
  accessToken: string,
  agentHighLevelId: string,
  locationId: string
): Promise<any> {
  const url = `${HIGHLEVEL_BASE_URL}/voice-ai/agents/${agentHighLevelId}?locationId=${locationId}`;
  const response = await fetch(url, { headers: getHeaders(accessToken) });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch agent ${agentHighLevelId}: ${response.status} ${errorText}`);
  }

  return response.json();
}

async function fetchAgentPhoneAssignments(
  supabase: EdgeSupabaseClient,
  agentIds: string[]
): Promise<AgentPhoneNumbers> {
  if (!agentIds || agentIds.length === 0) {
    return {};
  }

  const { data: agentPhones } = await supabase
    .from("agent_phone_numbers")
    .select("agent_id, phone_numbers:phone_number_id(id, phone_number)")
    .in("agent_id", agentIds);

  const map: AgentPhoneNumbers = {};

  (agentPhones || []).forEach((ap: any) => {
    if (!ap.phone_numbers) return;
    if (!map[ap.agent_id]) map[ap.agent_id] = [];
    map[ap.agent_id].push({
      id: ap.phone_numbers.id,
      phone_number: ap.phone_numbers.phone_number,
    });
  });

  return map;
}

async function getOrCreatePhoneNumberRecord(
  supabase: EdgeSupabaseClient,
  phoneNumber: string,
  metadata?: any
): Promise<{ id: string; phone_number: string } | null> {
  if (!phoneNumber) return null;
  const trimmed = phoneNumber.trim();
  if (!trimmed) return null;

  const label = deriveLabelFromMetadata(metadata);
  const isActive = deriveIsActiveFromMetadata(metadata);

  const { data: existing, error: selectError } = await supabase
    .from("phone_numbers")
    .select("id, phone_number, label, is_active")
    .eq("phone_number", trimmed)
    .maybeSingle();

  if (selectError && selectError.code !== "PGRST116") {
    console.error("[PHONE] Failed to load phone number record:", selectError);
    return null;
  }

  if (existing) {
    const updatePayload: Record<string, any> = {};
    if (label && existing.label !== label) {
      updatePayload.label = label;
    }
    if (typeof isActive === "boolean" && existing.is_active !== isActive) {
      updatePayload.is_active = isActive;
    }
    if (Object.keys(updatePayload).length > 0) {
      const { error: updateError } = await supabase
        .from("phone_numbers")
        .update(updatePayload)
        .eq("id", existing.id);
      if (updateError) {
        console.error("[PHONE] Failed to update phone metadata:", updateError);
      }
    }
    return existing;
  }

  const insertPayload: Record<string, any> = {
    phone_number: trimmed,
    is_active: typeof isActive === "boolean" ? isActive : true,
  };
  if (label) {
    insertPayload.label = label;
  }

  const { data: newRecord, error: insertError } = await supabase
    .from("phone_numbers")
    .insert(insertPayload)
    .select()
    .single();

  if (insertError) {
    console.error("[PHONE] Failed to create phone number record:", insertError);
    return null;
  }

  return newRecord;
}

async function linkPhoneToAgentRecord(
  supabase: EdgeSupabaseClient,
  agentId: string,
  phoneNumberId: string,
  source: "direct" | "pool"
) {
  const { error } = await supabase
    .from("agent_phone_numbers")
    .upsert(
      {
        agent_id: agentId,
        phone_number_id: phoneNumberId,
        assignment_source: source,
      },
      { onConflict: "agent_id,phone_number_id" }
    );

  if (error) {
    console.error("[PHONE] Failed to link phone to agent:", error);
  }
}

async function linkPhoneToUserRecord(
  supabase: EdgeSupabaseClient,
  userId: string,
  phoneNumberId: string
) {
  const { error } = await supabase
    .from("user_phone_numbers")
    .upsert(
      {
        user_id: userId,
        phone_number_id: phoneNumberId,
      },
      { onConflict: "user_id,phone_number_id" }
    );

  if (error) {
    console.error("[PHONE] Failed to link phone to user:", error);
  }
}

async function syncAgentPhoneAssignments({
  supabase,
  userId,
  accessToken,
  locationId,
  agents,
  syncLogger,
}: {
  supabase: EdgeSupabaseClient;
  userId: string;
  accessToken: string;
  locationId: string;
  agents: { id: string; highlevel_agent_id: string }[];
  syncLogger: SyncLogger;
}): Promise<{ processedAgents: number; linkedPhones: number }> {
  if (!locationId || agents.length === 0) {
    return { processedAgents: 0, linkedPhones: 0 };
  }

  let phoneMetadataMap = new Map<string, any>();
  try {
    const locationPhones = await fetchLocationPhoneNumbers(accessToken, locationId);
    phoneMetadataMap = buildPhoneMetadataMap(locationPhones);
    syncLogger.logs.push(`[PHONE] Retrieved ${locationPhones.length} phone numbers for location ${locationId}`);
  } catch (error) {
    console.error("[PHONE] Failed to fetch location phone numbers:", error);
    syncLogger.logs.push("[PHONE][WARN] Could not fetch location phone numbers");
  }

  let numberPools: any[] = [];
  try {
    numberPools = await fetchNumberPools(accessToken, locationId);
    syncLogger.logs.push(`[PHONE] Retrieved ${numberPools.length} number pools`);
  } catch (error) {
    console.warn("[PHONE] Number pools unavailable:", error);
    syncLogger.logs.push("[PHONE][WARN] Number pools unavailable for this location");
  }

  let processedAgents = 0;
  let linkedPhones = 0;

  for (const agent of agents) {
    processedAgents++;
    if (!agent.highlevel_agent_id) continue;

    try {
      const agentDetails = await fetchAgentDetailsFromHighLevel(
        accessToken,
        agent.highlevel_agent_id,
        locationId
      );

      const agentUpdate: Record<string, any> = {};
      const directPhone =
        agentDetails?.inboundNumber ||
        agentDetails?.phoneNumber ||
        agentDetails?.inbound_phone_number ||
        null;

      const poolId = agentDetails?.numberPoolId || agentDetails?.number_pool_id || null;

      if (directPhone) {
        agentUpdate.inbound_phone_number = directPhone;
      }
      if (poolId) {
        agentUpdate.highlevel_number_pool_id = poolId;
      }

      if (Object.keys(agentUpdate).length > 0) {
        const { error: updateError } = await supabase
          .from("agents")
          .update(agentUpdate)
          .eq("id", agent.id);
        if (updateError) {
          console.error("[PHONE] Failed to update agent record:", updateError);
        }
      }

      if (directPhone) {
        const metadata = phoneMetadataMap.get(normalizePhoneNumberValue(directPhone));
        const phoneRecord = await getOrCreatePhoneNumberRecord(supabase, directPhone, metadata);
        if (phoneRecord) {
          await linkPhoneToAgentRecord(supabase, agent.id, phoneRecord.id, "direct");
          await linkPhoneToUserRecord(supabase, userId, phoneRecord.id);
          linkedPhones++;
        }
      }

      if (poolId) {
        const pool = numberPools.find((p) => p.id === poolId);
        if (pool && Array.isArray(pool.phoneNumbers)) {
          for (const poolPhone of pool.phoneNumbers) {
            const poolNumber = extractPhoneNumberValue(poolPhone);
            if (!poolNumber) continue;
            const metadata = phoneMetadataMap.get(normalizePhoneNumberValue(poolNumber));
            const phoneRecord = await getOrCreatePhoneNumberRecord(supabase, poolNumber, metadata);
            if (phoneRecord) {
              await linkPhoneToAgentRecord(supabase, agent.id, phoneRecord.id, "pool");
              await linkPhoneToUserRecord(supabase, userId, phoneRecord.id);
              linkedPhones++;
            }
          }
        }
      }
    } catch (error) {
      console.error(`[PHONE] Failed to sync phones for agent ${agent.highlevel_agent_id}:`, error);
      syncLogger.logs.push(
        `[PHONE][ERROR] Agent ${agent.highlevel_agent_id} sync failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  return { processedAgents, linkedPhones };
}

function calculateCallCost(
  durationSeconds: number,
  direction: string,
  billingAccount: any
): { cost: number; displayCost: string | null } {
  if (!billingAccount) {
    return { cost: 0, displayCost: null };
  }

  if (direction === 'inbound' && billingAccount.inbound_plan === 'inbound_unlimited') {
    return { cost: 0, displayCost: 'INCLUDED' };
  }

  const durationMinutes = durationSeconds / 60;
  let rateCents = 0;

  if (direction === 'inbound' && billingAccount.inbound_rate_cents) {
    rateCents = billingAccount.inbound_rate_cents;
  } else if (direction === 'outbound' && billingAccount.outbound_rate_cents) {
    rateCents = billingAccount.outbound_rate_cents;
  }

  if (!rateCents) {
    rateCents = 100;
  }

  const cost = (durationMinutes * rateCents) / 100;
  return { cost: parseFloat(cost.toFixed(2)), displayCost: null };
}

Deno.serve(async (req: Request) => {
  console.log("[SYNC] ========== FUNCTION ENTRY ==========");

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  const syncStartTime = Date.now();
  let syncLogId: string | null = null;

  try {
    console.log("[SYNC] Function invoked - processing request");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      console.error("[SYNC] Missing authorization header");
      return new Response(
        JSON.stringify({ error: "Missing or invalid authorization" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const bearer = authHeader.replace("Bearer ", "");

    console.log("[SYNC] Parsing request body");
    const requestBody = await req.json();
    console.log("[SYNC] Request body:", JSON.stringify(requestBody));

    const {
      userId,
      startDate,
      endDate,
      syncType = 'manual',
      timezone = 'America/New_York',
      adminOverride = false,
      adminUserId
    }: SyncCallsRequest = requestBody;

    const allowedSyncTypes = ['manual', 'auto'];
    const normalizedSyncType = allowedSyncTypes.includes(syncType) ? syncType : 'manual';
    console.log(`[SYNC] syncType="${syncType}" normalized to "${normalizedSyncType}" | userId="${userId}"`);

    if (!userId) {
      console.error("[SYNC] Missing userId");
      return new Response(
        JSON.stringify({ error: "userId is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
      console.error("[SYNC] Invalid date range: start > end");
      return new Response(
        JSON.stringify({ error: "startDate must be before or equal to endDate" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`[SYNC] Parameters validated - userId: ${userId}, syncType: ${normalizedSyncType}, adminOverride: ${adminOverride}`);

    let isAdmin = false;
    let callerId: string | null = null;

    if (bearer === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
      isAdmin = true;
    } else {
      const { data: { user }, error: userError } = await supabase.auth.getUser(bearer);
      if (userError || !user) {
        console.error("[SYNC] Unauthorized user");
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      callerId = user.id;

      const { data: callerRecord, error: roleError } = await supabase
        .from("users")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (roleError) {
        console.error("[SYNC] Failed to fetch caller role:", roleError);
        return new Response(
          JSON.stringify({ error: "Failed to verify caller permissions" }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      isAdmin = callerRecord?.role === "admin";

      if (!isAdmin && callerId !== userId) {
        console.error("[SYNC] Forbidden: caller cannot sync another user");
        return new Response(
          JSON.stringify({ error: "Forbidden" }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    const syncLogger: SyncLogger = {
      logId: crypto.randomUUID(),
      startTime: syncStartTime,
      logs: [],
      skippedCalls: [],
      skipReasons: {},
      apiPages: [],
    };

    const { data: syncLogData, error: syncLogError } = await supabase
      .from('call_sync_logs')
      .insert({
        user_id: userId,
        sync_started_at: new Date(syncStartTime).toISOString(),
        sync_type: normalizedSyncType,
        sync_status: 'in_progress',
        timezone_used: timezone,
        admin_override: adminOverride && isAdmin,
        admin_user_id: (adminOverride && isAdmin ? (adminUserId || callerId) : null),
        api_params: {
          startDate: startDate || null,
          endDate: endDate || null,
          timezone: timezone,
        },
      })
      .select()
      .single();

    if (syncLogError) {
      console.error("Failed to create sync log:", syncLogError);
    } else {
      syncLogId = syncLogData.id;
      syncLogger.logId = syncLogId;
    }

    // Determine source for activity logging
    const activitySource = normalizedSyncType === 'auto' ? 'auto' : 'manual';

    // Log sync started event
    await logActivityEvent(
      supabase,
      userId,
      'sync_started',
      `Call sync ${normalizedSyncType === 'auto' ? 'automatically ' : ''}started`,
      {
        syncType: normalizedSyncType,
        syncLogId: syncLogId,
        adminOverride: adminOverride,
        startDate: startDate || null,
        endDate: endDate || null,
        timezone: timezone,
      },
      'info',
      activitySource
    );

    syncLogger.logs.push(`[START] Sync initiated - Type: ${normalizedSyncType}, Admin Override: ${adminOverride}`);

    console.log(`[SYNC] Looking up OAuth connection for user ${userId}`);
    const { data: oauthData, error: oauthError } = await supabase
      .from("api_keys")
      .select("id, access_token, refresh_token, token_expires_at, location_id")
      .eq("user_id", userId)
      .eq("service", "highlevel")
      .eq("is_active", true)
      .maybeSingle();

    if (oauthError) {
      console.error("[SYNC] Database error fetching OAuth:", oauthError);
      const errorMsg = `Database error: ${oauthError.message}`;
      syncLogger.logs.push(`[ERROR] ${errorMsg}`);

      if (syncLogId) {
        await supabase
          .from('call_sync_logs')
          .update({
            sync_status: 'failed',
            sync_completed_at: new Date().toISOString(),
            error_details: { message: errorMsg, logs: syncLogger.logs },
          })
          .eq('id', syncLogId);
      }

      return new Response(
        JSON.stringify({ error: errorMsg }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!oauthData) {
      console.error("[SYNC] No OAuth connection found for user");
      const errorMsg = "No HighLevel OAuth connection found for this user. Please connect to HighLevel first.";
      syncLogger.logs.push(`[ERROR] ${errorMsg}`);

      if (syncLogId) {
        await supabase
          .from('call_sync_logs')
          .update({
            sync_status: 'failed',
            sync_completed_at: new Date().toISOString(),
            error_details: { message: errorMsg, logs: syncLogger.logs },
          })
          .eq('id', syncLogId);
      }

      return new Response(
        JSON.stringify({ error: errorMsg, requiresSetup: true }),
        {
          status: 422,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`[SYNC] OAuth connection found - location: ${oauthData.location_id}`);

    // Load user agents and their phone numbers to attach phone_number_id to calls
    const { data: userAgents, error: userAgentsError } = await supabase
      .from('user_agents')
      .select('agent_id, agents:agent_id(id, highlevel_agent_id)')
      .eq('user_id', userId);

    if (userAgentsError) {
      console.error('[SYNC] Failed to load user agents:', userAgentsError);
    }

    const agentIdsForUser = (userAgents || []).map((ua: any) => ua.agent_id);
    const agentsWithHighLevelIds = (userAgents || [])
      .map((ua: any) => ua.agents)
      .filter((agent: any) => agent?.id && agent?.highlevel_agent_id)
      .map((agent: any) => ({
        id: agent.id,
        highlevel_agent_id: agent.highlevel_agent_id,
      }));
    const normalizeNumber = (num: string) => num.replace(/[^0-9]/g, '').replace(/^1(?=\d{10}$)/, '');

    let agentPhoneMap = await fetchAgentPhoneAssignments(supabase, agentIdsForUser);

    const { data: billingAccount, error: billingError } = await supabase
      .from("billing_accounts")
      .select("inbound_rate_cents, outbound_rate_cents, inbound_plan, calls_reset_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (billingError) {
      console.error("Billing account error:", billingError);
    }

    let accessToken = oauthData.access_token;

    // Only refresh token if it's actually expired
    // The 401 retry logic will handle cases where the token is invalid but not expired
    if (new Date(oauthData.token_expires_at) <= new Date()) {
      syncLogger.logs.push(`[AUTH] Access token expired, refreshing...`);

      const refreshResponse = await fetch(
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/oauth-refresh`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({ userId }),
        }
      );

      if (!refreshResponse.ok) {
        const refreshErrorText = await refreshResponse.text();
        const errorMsg = `Failed to refresh access token: ${refreshErrorText}`;
        syncLogger.logs.push(`[ERROR] ${errorMsg}`);
        console.error(`[SYNC] Token refresh failed for user ${userId}:`, refreshErrorText);

        if (syncLogId) {
          await supabase
            .from('call_sync_logs')
            .update({
              sync_status: 'failed',
              sync_completed_at: new Date().toISOString(),
              error_details: { message: errorMsg, logs: syncLogger.logs },
            })
            .eq('id', syncLogId);
        }

        return new Response(
          JSON.stringify({ error: errorMsg }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const refreshData = await refreshResponse.json();
      accessToken = refreshData.access_token;
      syncLogger.logs.push(`[AUTH] Token refreshed successfully`);
    }

    if (accessToken && oauthData.location_id && agentsWithHighLevelIds.length > 0) {
      try {
        const phoneSyncStats = await syncAgentPhoneAssignments({
          supabase,
          userId,
          accessToken,
          locationId: oauthData.location_id,
          agents: agentsWithHighLevelIds,
          syncLogger,
        });
        syncLogger.logs.push(
          `[PHONE] Synced ${phoneSyncStats.linkedPhones} phone assignments across ${phoneSyncStats.processedAgents} agents`
        );
        agentPhoneMap = await fetchAgentPhoneAssignments(supabase, agentIdsForUser);
      } catch (error) {
        console.error("[PHONE] Failed to sync agent phone assignments:", error);
        syncLogger.logs.push(
          `[PHONE][ERROR] ${error instanceof Error ? error.message : "Unknown error syncing phone numbers"}`
        );
      }
    } else if (agentIdsForUser.length > 0 && !oauthData.location_id) {
      syncLogger.logs.push("[PHONE][WARN] Skipped phone sync: no location_id on OAuth connection");
    }

    let effectiveStartDate = startDate;
    let originalResetDate: string | null = null;

    // If no start date provided and not admin override, try to find the latest call
    if (!effectiveStartDate && !adminOverride) {
      const { data: latestCall } = await supabase
        .from('calls')
        .select('call_started_at')
        .eq('user_id', userId)
        .order('call_started_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestCall?.call_started_at) {
        // Add 1 second to avoid fetching the same call again (though upsert handles it)
        const latestDate = new Date(latestCall.call_started_at);
        latestDate.setSeconds(latestDate.getSeconds() + 1);
        effectiveStartDate = latestDate.toISOString();
        syncLogger.logs.push(`[AUTO-INCREMENTAL] Found latest call at ${latestCall.call_started_at}. Setting start date to ${effectiveStartDate}`);
      }
    }

    if (adminOverride) {
      // Ensure startDate is treated as undefined if null, to avoid new Date(null) -> 1970
      // Also handle string "null" which might come from JSON serialization quirks
      if (startDate === null || startDate === 'null' || startDate === '') {
        effectiveStartDate = undefined;
      } else {
        effectiveStartDate = startDate;
      }

      originalResetDate = billingAccount?.calls_reset_at || null;
      syncLogger.logs.push(`[ADMIN OVERRIDE] Bypassing calls_reset_at restriction`);
      if (originalResetDate) {
        syncLogger.logs.push(`[ADMIN OVERRIDE] Original calls_reset_at: ${originalResetDate}`);
      }
    } else if (billingAccount?.calls_reset_at) {
      const resetDate = new Date(billingAccount.calls_reset_at).toISOString();
      if (!startDate || new Date(resetDate) > new Date(startDate)) {
        effectiveStartDate = resetDate;
        syncLogger.logs.push(`[DATE] Using calls_reset_at as startDate filter: ${resetDate}`);
      }
    }

    if (adminOverride && originalResetDate && syncLogId) {
      await supabase
        .from('call_sync_logs')
        .update({ original_reset_date: originalResetDate })
        .eq('id', syncLogId);
    }

    const effectiveEndDate = endDate || new Date().toISOString();

    console.log(`[DEBUG] Received startDate: ${startDate} (type: ${typeof startDate}), endDate: ${endDate}`);
    console.log(`[DEBUG] Effective startDate: ${effectiveStartDate}, endDate: ${effectiveEndDate}`);

    const baseParams: Record<string, string> = {};
    if (oauthData.location_id) {
      baseParams.locationId = oauthData.location_id;
    }
    // Do not add startDate/endDate to baseParams as they are added per-chunk
    // if (effectiveStartDate) baseParams.startDate = effectiveStartDate;
    // if (effectiveEndDate) baseParams.endDate = effectiveEndDate;
    baseParams.timezone = timezone;

    syncLogger.logs.push(`[API] Location: ${oauthData.location_id}, Start: ${effectiveStartDate || 'none'}, End: ${effectiveEndDate}, Timezone: ${timezone}`);
    console.log(`[SYNC] Preparing to fetch calls - Start: ${effectiveStartDate}, End: ${effectiveEndDate}, Timezone: ${timezone}`);

    const allRawCalls: any[] = [];
    const callsById = new Map<string, any>();
    let totalApiTime = 0;

    const rangeStartDate = (effectiveStartDate && !isNaN(new Date(effectiveStartDate).getTime()))
      ? new Date(effectiveStartDate)
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const rangeEndDate = new Date(effectiveEndDate);

    console.log(`[DEBUG] Range Start (Date obj): ${rangeStartDate.toString()}`);
    console.log(`[DEBUG] Range Start (ISO): ${rangeStartDate.toISOString()}`);
    console.log(`[DEBUG] Range End (ISO): ${rangeEndDate.toISOString()}`);

    // Fetch deleted calls to exclude them
    const { data: deletedCallsData } = await supabase
      .from('deleted_calls')
      .select('highlevel_call_id')
      .eq('user_id', userId);

    const deletedCallIds = new Set((deletedCallsData || []).map(d => d.highlevel_call_id));
    if (deletedCallIds.size > 0) {
      syncLogger.logs.push(`[FILTER] Found ${deletedCallIds.size} deleted calls to exclude`);
    }

    const chunks: Array<{ start: string; end: string }> = [];
    let currentDate = new Date(rangeStartDate);

    while (currentDate <= rangeEndDate) {
      const chunkStart = new Date(currentDate);
      const chunkEnd = new Date(currentDate);
      chunkEnd.setHours(23, 59, 59, 999);

      if (chunkEnd > rangeEndDate) {
        chunks.push({
          start: chunkStart.toISOString(),
          end: rangeEndDate.toISOString(),
        });
        break;
      } else {
        chunks.push({
          start: chunkStart.toISOString(),
          end: chunkEnd.toISOString(),
        });
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    syncLogger.logs.push(`[CHUNKING] Date range split into ${chunks.length} daily chunks`);
    if (chunks.length > 0) {
      console.log(`[DEBUG] First chunk: ${JSON.stringify(chunks[0])}`);
      console.log(`[DEBUG] Last chunk: ${JSON.stringify(chunks[chunks.length - 1])}`);
    }

    const pageSize = 50; // HighLevel limit is 50
    let tokenRefreshAttempted = false; // Track if we've already tried refreshing the token

    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
      const chunk = chunks[chunkIndex];
      let page = 1;

      while (true) {
        const queryParams = new URLSearchParams({
          ...baseParams,
          page: page.toString(),
          pageSize: pageSize.toString(),
          startDate: chunk.start,
          endDate: chunk.end,
          timezone: timezone,
        });

        const apiUrl = `https://services.leadconnectorhq.com/voice-ai/dashboard/call-logs?${queryParams}`;
        const apiCallStart = Date.now();

        syncLogger.logs.push(`[API REQUEST] Chunk ${chunkIndex + 1}/${chunks.length} Page ${page} Range: ${chunk.start} to ${chunk.end}`);
        console.log(`[SYNC] Calling HighLevel API: ${apiUrl}`);

        let response = await fetch(apiUrl, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Version: "2021-07-28",
          },
        });

        const apiCallTime = Date.now() - apiCallStart;
        totalApiTime += apiCallTime;

        // Log response status for debugging
        console.log(`[SYNC] HighLevel API response status: ${response.status}, ok: ${response.ok}`);
        syncLogger.logs.push(`[API RESPONSE] Status: ${response.status}`);

        // Handle 401 errors by attempting to refresh the token once
        if (response.status === 401 && !tokenRefreshAttempted) {
          tokenRefreshAttempted = true;
          syncLogger.logs.push(`[AUTH] Received 401 from HighLevel, attempting token refresh...`);
          console.log(`[SYNC] ====== 401 RETRY TRIGGERED ====== for user ${userId}`);
          console.log(`[SYNC] tokenRefreshAttempted was false, now attempting refresh`);

          try {
            const refreshResponse = await fetch(
              `${Deno.env.get("SUPABASE_URL")}/functions/v1/oauth-refresh`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "apikey": Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
                  "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                },
                body: JSON.stringify({ userId }),
              }
            );

            if (refreshResponse.ok) {
              const refreshData = await refreshResponse.json();
              accessToken = refreshData.access_token;
              syncLogger.logs.push(`[AUTH] Token refreshed successfully, retrying API call...`);
              console.log(`[SYNC] Token refreshed successfully, retrying...`);

              // Retry the same request with the new token
              response = await fetch(apiUrl, {
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  Version: "2021-07-28",
                },
              });
            } else {
              const refreshError = await refreshResponse.text();
              syncLogger.logs.push(`[AUTH] Token refresh failed: ${refreshError}`);
              console.error(`[SYNC] Token refresh failed:`, refreshError);
            }
          } catch (refreshErr) {
            syncLogger.logs.push(`[AUTH] Token refresh error: ${refreshErr instanceof Error ? refreshErr.message : 'Unknown error'}`);
            console.error(`[SYNC] Token refresh exception:`, refreshErr);
          }
        }

        if (!response.ok) {
          const errorText = await response.text();
          const errorMsg = `HighLevel API error: ${response.status}`;
          console.error(`[SYNC] ${errorMsg}`, errorText);
          syncLogger.logs.push(`[ERROR] ${errorMsg}: ${errorText}`);

          const responseBody = JSON.stringify({ error: errorMsg, details: errorText });
          console.log(`[SYNC] Returning error response with status ${response.status}: ${responseBody.substring(0, 300)}`);

          // Log the API error as an integration error
          await logIntegrationError(
            supabase,
            userId,
            'api_error',
            errorMsg,
            String(response.status),
            { url: apiUrl, syncType: normalizedSyncType },
            { status: response.status, body: errorText.substring(0, 500) }
          );

          // Log sync failed event
          await logActivityEvent(
            supabase,
            userId,
            'sync_failed',
            `Call sync failed: ${errorMsg}`,
            {
              syncType: normalizedSyncType,
              syncLogId: syncLogId,
              errorStatus: response.status,
              errorMessage: errorText.substring(0, 200),
            },
            'error',
            activitySource
          );

          if (syncLogId) {
            await supabase
              .from('call_sync_logs')
              .update({
                sync_status: 'failed',
                sync_completed_at: new Date().toISOString(),
                error_details: { message: errorMsg, logs: syncLogger.logs },
              })
              .eq('id', syncLogId);
          }

          return new Response(
            responseBody,
            {
              status: response.status,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        const data = await response.json();
        const calls = data.callLogs || data.calls || [];

        syncLogger.apiPages.push({
          chunk: `${chunkIndex + 1}/${chunks.length}`,
          page,
          callsReturned: calls.length,
          apiTime: apiCallTime,
          dateRange: `${chunk.start} to ${chunk.end}`,
          timezone: timezone,
        });

        syncLogger.logs.push(`[API RESPONSE] Chunk ${chunkIndex + 1}/${chunks.length} Page ${page} returned ${calls.length} calls`);

        for (const call of calls) {
          if (!callsById.has(call.id)) {
            callsById.set(call.id, call);
            allRawCalls.push(call);
          }
        }

        // Update last_used_at for this API key after a successful page fetch
        if (oauthData.id) {
          await supabase
            .from('api_keys')
            .update({ last_used_at: new Date().toISOString() })
            .eq('id', oauthData.id);
        }

        if (calls.length < pageSize) {
          break; // last page for this chunk
        }

        page++;
        if (page > 200) {
          syncLogger.logs.push(`[WARN] Pagination stopped after 200 pages for chunk ${chunkIndex + 1}`);
          break;
        }
      }
    }

    syncLogger.logs.push(`[FETCH] Retrieved ${allRawCalls.length} total calls from HighLevel (${totalApiTime}ms)`);

    let insertedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    for (const rawCall of allRawCalls) {
      try {
        const fromNumber = rawCall.from_number || rawCall.fromNumber || '';
        const toNumber = rawCall.to_number || rawCall.toNumber || '';
        const direction = rawCall.direction || 'inbound';

        if (!fromNumber || fromNumber === 'null' || fromNumber === 'undefined') {
          skippedCount++;
          syncLogger.skipReasons['no_from_number'] = (syncLogger.skipReasons['no_from_number'] || 0) + 1;
          syncLogger.skippedCalls.push({
            id: rawCall.id,
            reason: 'no_from_number',
            to_number: toNumber,
            direction,
          });
          continue;
        }

        const destinationNumber = rawCall.destinationNumber || rawCall.destination_number || rawCall.dialedNumber;
        const destinationNumberSafe =
          destinationNumber && destinationNumber !== 'null' && destinationNumber !== 'undefined'
            ? destinationNumber
            : '';
        const toNumberSafe = toNumber && toNumber !== 'null' && toNumber !== 'undefined'
          ? toNumber
          : destinationNumberSafe || 'unknown';

        if (rawCall.is_test_call === true) {
          skippedCount++;
          syncLogger.skipReasons['is_test_call'] = (syncLogger.skipReasons['is_test_call'] || 0) + 1;
          syncLogger.skippedCalls.push({
            id: rawCall.id,
            reason: 'is_test_call_flag',
            from_number: fromNumber,
            to_number: toNumber,
          });
          continue;
        }

        if (!adminOverride && deletedCallIds.has(rawCall.id)) {
          skippedCount++;
          syncLogger.skipReasons['deleted_call'] = (syncLogger.skipReasons['deleted_call'] || 0) + 1;
          syncLogger.skippedCalls.push({
            id: rawCall.id,
            reason: 'previously_deleted',
          });
          continue;
        }

        const { data: existingCall } = await supabase
          .from("calls")
          .select("id")
          .eq("highlevel_call_id", rawCall.id)
          .maybeSingle();

        const durationSeconds = rawCall.duration || 0;
        const { cost, displayCost } = calculateCallCost(durationSeconds, direction, billingAccount);

        // Look up the database UUID for the HighLevel agent ID
        const highlevelAgentId = rawCall.agent_id || rawCall.agentId;
        let agentUuid = null;

        if (highlevelAgentId) {
          const { data: agentData } = await supabase
            .from("agents")
            .select("id")
            .eq("highlevel_agent_id", highlevelAgentId)
            .maybeSingle();

          agentUuid = agentData?.id || null;
        }

        // Map actions from executedCallActions
        let actionTriggered: string | null = null;
        if (Array.isArray(rawCall.executedCallActions) && rawCall.executedCallActions.length > 0) {
          const actions = rawCall.executedCallActions
            .map((a: any) => a.actionType || a.actionName || '')
            .filter((a: string) => a && a.length > 0);
          if (actions.length > 0) {
            actionTriggered = Array.from(new Set(actions)).join(',');
          }
        }

        // Attach phone_number_id if matching agent's numbers
        let phoneNumberId: string | null = null;
        if (agentUuid) {
          const agentNumbers = agentPhoneMap[agentUuid] || [];
          if (agentNumbers.length > 0) {
            const fromNorm = fromNumber ? normalizeNumber(fromNumber) : '';
            const toNorm = toNumberSafe ? normalizeNumber(toNumberSafe) : '';
            const destNorm = destinationNumber ? normalizeNumber(destinationNumber) : '';
            const match = agentNumbers.find((n) => {
              const norm = normalizeNumber(n.phone_number);
              return norm === fromNorm || norm === toNorm || norm === destNorm;
            });
            if (match) phoneNumberId = match.id;
          }

          if (!phoneNumberId && agentNumbers.length === 1) {
            phoneNumberId = agentNumbers[0].id;
          }
        }

        const rawFirst =
          rawCall.extractedData?.name ||
          rawCall.extractedData?.Name ||
          rawCall.first_name ||
          rawCall.firstName ||
          null;
        const rawLast =
          rawCall.extractedData?.lastName ||
          rawCall.extractedData?.['Last Name'] ||
          rawCall.last_name ||
          rawCall.lastName ||
          null;

        // Build a sane contact display name with simple cleanup rules
        let contactName = '';
        if (rawFirst && rawFirst.toLowerCase() !== 'n/a') {
          contactName = rawFirst;
        }
        if (rawLast && rawLast.toLowerCase() !== 'n/a') {
          contactName = contactName ? `${contactName} ${rawLast}` : rawLast;
        }

        if (!contactName && rawCall.contact_name && !/contact\s+[a-z0-9]+/i.test(rawCall.contact_name)) {
          contactName = rawCall.contact_name;
        }

        if (!contactName && rawCall.contactName && !/contact\s+[a-z0-9]+/i.test(rawCall.contactName)) {
          contactName = rawCall.contactName;
        }

        // If still empty or looks like a raw contact id, set Unknown
        if (!contactName || /contact\s+[a-z0-9]+/i.test(contactName) || /^contact\s*$/i.test(contactName)) {
          contactName = 'Unknown';
        }

        // Normalize spacing and title case
        const contactNameFormatted =
          contactName && contactName.trim().length > 0
            ? contactName.trim().replace(/\s+/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
            : 'Unknown';

        const callData = {
          highlevel_call_id: rawCall.id,
          user_id: userId,
          agent_id: agentUuid,
          contact_name: contactNameFormatted,
          from_number: fromNumber,
          to_number: toNumberSafe,
          direction: direction,
          status: rawCall.status,
          duration_seconds: durationSeconds,
          call_started_at: rawCall.createdAt ? new Date(rawCall.createdAt).toISOString() : null,
          call_ended_at: rawCall.ended_at ? new Date(rawCall.ended_at).toISOString() : null,
          recording_url:
            rawCall.recording_url ||
            rawCall.recordingUrl ||
            rawCall.call_recording_url ||
            rawCall.callRecordingUrl ||
            rawCall.recording_link ||
            rawCall.recordingLink ||
            (rawCall.recordings?.[0]?.url ?? null),
          transcript: rawCall.transcript || null,
          cost: cost,
          display_cost: displayCost,
          message_id:
            rawCall.message_id ||
            rawCall.messageId ||
            rawCall.conversation_message_id ||
            rawCall.conversationMessageId ||
            null,
          location_id: oauthData.location_id,
          is_test_call: rawCall.trialCall || false,
          summary: rawCall.summary || null,
          action_triggered: actionTriggered,
          phone_number_id: phoneNumberId,
        };

        // If key media identifiers are missing, fetch call detail to retrieve recording link and message id
        if (!callData.recording_url || !callData.message_id) {
          try {
            const detailUrl = `https://services.leadconnectorhq.com/voice-ai/dashboard/call-logs/${rawCall.id}`;
            const detailResponse = await fetch(detailUrl, {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                Version: "2021-07-28",
              },
            });
            if (detailResponse.ok) {
              const detail = await detailResponse.json();
              const recordingUrl =
                detail.recording_url ||
                detail.recordingUrl ||
                detail.call_recording_url ||
                detail.callRecordingUrl ||
                detail.recording_link ||
                detail.recordingLink ||
                (detail.recordings?.[0]?.url ?? null);
              const detailMessageId =
                detail.message_id ||
                detail.messageId ||
                detail.conversation_message_id ||
                detail.conversationMessageId ||
                detail.message?.id ||
                detail.message?.messageId ||
                detail.call?.messageId ||
                detail.conversation?.messageId ||
                null;
              if (recordingUrl) {
                callData.recording_url = recordingUrl;
              }
              if (detailMessageId && !callData.message_id) {
                callData.message_id = detailMessageId;
              }

              // Debug logging to help map missing fields in production without exposing payloads
              if (!callData.recording_url || !callData.message_id) {
                const detailKeys = Object.keys(detail || {});
                const nestedMessageKeys = detail?.message ? Object.keys(detail.message) : [];
                const nestedCallKeys = detail?.call ? Object.keys(detail.call) : [];
                syncLogger.logs.push(
                  `[DETAIL-DEBUG] ${rawCall.id} missing=${!callData.recording_url ? 'recording' : ''}${!callData.recording_url && !callData.message_id ? '+' : ''}${!callData.message_id ? 'messageId' : ''}; keys=${detailKeys.join(',').slice(0, 500)}; messageKeys=${nestedMessageKeys.join(',')}; callKeys=${nestedCallKeys.join(',')}`
                );
              }
            }
          } catch (e) {
            console.error("[SYNC] Failed to fetch call detail for recording:", e);
          }
        }

        let callId = existingCall?.id;

        if (existingCall) {
          const { error: updateError } = await supabase
            .from("calls")
            .update({ ...callData, to_number: toNumberSafe })
            .eq("highlevel_call_id", rawCall.id);

          if (updateError) {
            skippedCount++;
            syncLogger.skipReasons['update_error'] = (syncLogger.skipReasons['update_error'] || 0) + 1;
            syncLogger.skippedCalls.push({
              id: rawCall.id,
              reason: 'update_error',
              details: updateError.message,
            });
          } else {
            updatedCount++;
          }
        } else {
          const { data: insertedCall, error: insertError } = await supabase
            .from("calls")
            .insert({ ...callData, to_number: toNumberSafe })
            .select('id')
            .single();

          if (insertError) {
            skippedCount++;
            syncLogger.skipReasons['insert_error'] = (syncLogger.skipReasons['insert_error'] || 0) + 1;
            syncLogger.skippedCalls.push({
              id: rawCall.id,
              reason: 'insert_error',
              details: insertError.message,
            });
          } else {
            insertedCount++;
            callId = insertedCall.id;
          }
        }

        // Create usage log entry if there's a cost and we have a valid call ID
        if (callId && cost > 0 && displayCost !== 'INCLUDED') {
          // Check if usage log already exists to avoid duplicates
          const { data: existingLog } = await supabase
            .from("usage_logs")
            .select("id")
            .eq("call_id", callId)
            .maybeSingle();

          if (!existingLog) {
            const { error: usageLogError } = await supabase
              .from("usage_logs")
              .insert({
                user_id: userId,
                call_id: callId,
                cost_cents: Math.round(cost * 100),
                usage_type: direction,
                created_at: callData.call_started_at,
              });

            if (usageLogError) {
              console.error(`Error creating usage log for call ${callId}:`, usageLogError);
              syncLogger.logs.push(`[ERROR] Failed to create usage log for call ${rawCall.id}: ${usageLogError.message}`);
            }
          } else {
            // Update existing log if cost changed (e.g. rate change or duration update)
            const { error: usageLogUpdateError } = await supabase
              .from("usage_logs")
              .update({
                cost_cents: Math.round(cost * 100),
                usage_type: direction,
                created_at: callData.call_started_at,
              })
              .eq("id", existingLog.id);

            if (usageLogUpdateError) {
              console.error(`Error updating usage log for call ${callId}:`, usageLogUpdateError);
            }
          }
        }
      } catch (error) {
        console.error(`Error processing call ${rawCall.id}:`, error);
        syncLogger.logs.push(`[ERROR] Failed to process call ${rawCall.id}: ${error.message}`);
      }
    }

    const syncDuration = Date.now() - syncStartTime;
    syncLogger.logs.push(`[COMPLETE] Inserted: ${insertedCount}, Updated: ${updatedCount}, Skipped: ${skippedCount}, Duration: ${syncDuration}ms`);

    if (syncLogId) {
      const { error: logUpdateError } = await supabase
        .from('call_sync_logs')
        .update({
          sync_status: 'success',
          sync_completed_at: new Date().toISOString(),
          duration_ms: syncDuration,
          api_response_summary: {
            total_calls: allRawCalls.length,
            api_time_ms: totalApiTime,
            pages: syncLogger.apiPages,
            logs: syncLogger.logs,
          },
          processing_summary: {
            inserted: insertedCount,
            updated: updatedCount,
            skipped: skippedCount,
            skip_reasons: syncLogger.skipReasons,
          },
          skipped_calls: syncLogger.skippedCalls.slice(0, 50),
        })
        .eq('id', syncLogId);

      if (logUpdateError) {
        console.error('[SYNC] Failed to finalize sync log:', logUpdateError);
      }
    }

    // Log sync completed event
    await logActivityEvent(
      supabase,
      userId,
      'sync_completed',
      `Call sync completed: ${insertedCount} inserted, ${updatedCount} updated, ${skippedCount} skipped`,
      {
        syncType: normalizedSyncType,
        syncLogId: syncLogId,
        inserted: insertedCount,
        updated: updatedCount,
        skipped: skippedCount,
        total: allRawCalls.length,
        durationMs: syncDuration,
      },
      'info',
      activitySource
    );

    return new Response(
      JSON.stringify({
        success: true,
        inserted: insertedCount,
        updated: updatedCount,
        skipped: skippedCount,
        total: allRawCalls.length,
        syncLogId: syncLogId,
        skipReasons: syncLogger.skipReasons,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[SYNC] Unhandled error:", error);
    console.error("[SYNC] Error stack:", error.stack);

    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    if (syncLogId) {
      try {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );

        await supabase
          .from('call_sync_logs')
          .update({
            sync_status: 'failed',
            sync_completed_at: new Date().toISOString(),
            error_details: { message: errorMessage, stack: errorStack },
          })
          .eq('id', syncLogId);
      } catch (logError) {
        console.error("[SYNC] Failed to update sync log:", logError);
      }
    }

    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: errorMessage,
        stack: errorStack
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
