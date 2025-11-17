import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface DiagnosticRequest {
  userId: string;
  startDate?: string;
  endDate?: string;
  includeRawData?: boolean;
}

interface CallComparison {
  callId: string;
  status: 'in_both' | 'only_highlevel' | 'only_database';
  agentId?: string;
  agentStatus?: string;
  reason?: string;
  fromNumber?: string;
  toNumber?: string;
  callDate?: string;
  contactName?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  const diagnosticStartTime = Date.now();

  try {
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

    const { userId, startDate, endDate, includeRawData = false }: DiagnosticRequest = await req.json();

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "userId is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`[DIAGNOSTIC] Starting comparison for user: ${userId}`);

    // Get OAuth token
    const { data: oauthData, error: oauthError } = await supabase
      .from("api_keys")
      .select("access_token, refresh_token, token_expires_at, location_id")
      .eq("user_id", userId)
      .eq("service", "highlevel")
      .eq("is_active", true)
      .maybeSingle();

    if (oauthError || !oauthData) {
      return new Response(
        JSON.stringify({ error: "No valid OAuth connection found" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    let accessToken = oauthData.access_token;

    // Check token expiration and refresh if needed
    if (new Date(oauthData.token_expires_at) <= new Date()) {
      console.log("[DIAGNOSTIC] Token expired, refreshing...");

      const refreshResponse = await fetch(
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/oauth-refresh`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
          },
          body: JSON.stringify({ userId }),
        }
      );

      if (!refreshResponse.ok) {
        return new Response(
          JSON.stringify({ error: "Failed to refresh token" }),
          {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const refreshData = await refreshResponse.json();
      accessToken = refreshData.access_token;
    }

    // Get billing account to check for calls_reset_at
    const { data: billingAccount } = await supabase
      .from("billing_accounts")
      .select("calls_reset_at")
      .eq("user_id", userId)
      .maybeSingle();

    // Determine effective date range
    let effectiveStartDate = startDate;
    if (!effectiveStartDate && billingAccount?.calls_reset_at) {
      effectiveStartDate = new Date(billingAccount.calls_reset_at).toISOString();
      console.log(`[DIAGNOSTIC] Using calls_reset_at as start: ${effectiveStartDate}`);
    } else if (!effectiveStartDate) {
      // Default to last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      effectiveStartDate = thirtyDaysAgo.toISOString();
      console.log(`[DIAGNOSTIC] Using default 30 days start: ${effectiveStartDate}`);
    }

    const effectiveEndDate = endDate || new Date().toISOString();

    console.log(`[DIAGNOSTIC] Date range: ${effectiveStartDate} to ${effectiveEndDate}`);

    // Fetch ALL calls from HighLevel with pagination
    const highLevelCalls: any[] = [];
    let page = 0;
    const pageSize = 100;
    const maxPages = 50;
    let hasMorePages = true;

    while (hasMorePages && page < maxPages) {
      const params = new URLSearchParams({
        locationId: oauthData.location_id,
        startDate: effectiveStartDate,
        endDate: effectiveEndDate,
        limit: pageSize.toString(),
        skip: (page * pageSize).toString(),
      });

      const hlUrl = `https://services.leadconnectorhq.com/voice-ai/dashboard/call-logs?${params}`;
      console.log(`[DIAGNOSTIC] Fetching HL page ${page + 1}`);

      const response = await fetch(hlUrl, {
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "Version": "2021-07-28",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[DIAGNOSTIC] HL API error:`, response.status, errorText);
        return new Response(
          JSON.stringify({ error: "Failed to fetch calls from HighLevel", details: errorText }),
          {
            status: response.status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const data = await response.json();
      const pageCalls = data.callLogs || [];
      highLevelCalls.push(...pageCalls);

      hasMorePages = pageCalls.length === pageSize;
      page++;

      if (hasMorePages && page < maxPages) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log(`[DIAGNOSTIC] Fetched ${highLevelCalls.length} calls from HighLevel`);

    // Fetch calls from database for the same date range
    const { data: dbCalls, error: dbError } = await supabase
      .from('calls')
      .select(`
        highlevel_call_id,
        agent_id,
        from_number,
        to_number,
        call_started_at,
        contact_name,
        is_test_call,
        agents (
          highlevel_agent_id,
          name
        )
      `)
      .eq('user_id', userId)
      .gte('call_started_at', effectiveStartDate)
      .lte('call_started_at', effectiveEndDate)
      .order('call_started_at', { ascending: false });

    if (dbError) {
      console.error(`[DIAGNOSTIC] DB error:`, dbError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch calls from database", details: dbError }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`[DIAGNOSTIC] Fetched ${dbCalls?.length || 0} calls from database`);

    // Get user's assigned agents
    const { data: userAgents } = await supabase
      .from('user_agents')
      .select('agent_id, agents(id, highlevel_agent_id, name)')
      .eq('user_id', userId);

    const assignedAgentHLIds = new Set(
      userAgents?.map((ua: any) => ua.agents?.highlevel_agent_id).filter(Boolean) || []
    );

    console.log(`[DIAGNOSTIC] User has ${assignedAgentHLIds.size} assigned agents`);

    // Get all agents in system
    const { data: allAgents } = await supabase
      .from('agents')
      .select('id, highlevel_agent_id, name');

    const agentMap = new Map(
      allAgents?.map((a: any) => [a.highlevel_agent_id, a]) || []
    );

    // Create comparison maps
    const hlCallMap = new Map(highLevelCalls.map(c => [c.id, c]));
    const dbCallMap = new Map((dbCalls || []).map((c: any) => [c.highlevel_call_id, c]));

    const comparisons: CallComparison[] = [];
    const missingInDB: CallComparison[] = [];
    const missingInHL: CallComparison[] = [];
    const matching: CallComparison[] = [];

    // Analyze HighLevel calls
    for (const hlCall of highLevelCalls) {
      const dbCall = dbCallMap.get(hlCall.id);

      if (dbCall) {
        matching.push({
          callId: hlCall.id,
          status: 'in_both',
          agentId: hlCall.agentId,
          fromNumber: hlCall.fromNumber || hlCall.from,
          toNumber: hlCall.toNumber || hlCall.to,
          callDate: hlCall.createdAt,
          contactName: hlCall.contactName,
        });
      } else {
        // Determine why this call is missing from DB
        let reason = 'unknown';
        let agentStatus = 'unknown';

        if (!hlCall.agentId) {
          reason = 'no_agent_id_in_call';
          agentStatus = 'missing';
        } else if (!agentMap.has(hlCall.agentId)) {
          reason = 'agent_not_in_system';
          agentStatus = 'not_found';
        } else if (!assignedAgentHLIds.has(hlCall.agentId)) {
          reason = 'agent_not_assigned_to_user';
          agentStatus = 'not_assigned';
        } else {
          reason = 'filtering_or_sync_issue';
          agentStatus = 'assigned';
        }

        const comparison: CallComparison = {
          callId: hlCall.id,
          status: 'only_highlevel',
          agentId: hlCall.agentId,
          agentStatus,
          reason,
          fromNumber: hlCall.fromNumber || hlCall.from,
          toNumber: hlCall.toNumber || hlCall.to,
          callDate: hlCall.createdAt,
          contactName: hlCall.contactName,
        };

        missingInDB.push(comparison);
        comparisons.push(comparison);
      }
    }

    // Check for calls in DB but not in HL response (should be rare)
    for (const dbCall of (dbCalls || [])) {
      if (!hlCallMap.has(dbCall.highlevel_call_id)) {
        const comparison: CallComparison = {
          callId: dbCall.highlevel_call_id,
          status: 'only_database',
          agentId: (dbCall.agents as any)?.highlevel_agent_id,
          reason: 'not_in_hl_response',
          fromNumber: dbCall.from_number,
          toNumber: dbCall.to_number,
          callDate: dbCall.call_started_at,
          contactName: dbCall.contact_name,
        };

        missingInHL.push(comparison);
        comparisons.push(comparison);
      }
    }

    // Aggregate reasons
    const reasonCounts: Record<string, number> = {};
    missingInDB.forEach(c => {
      reasonCounts[c.reason || 'unknown'] = (reasonCounts[c.reason || 'unknown'] || 0) + 1;
    });

    // Agent analysis
    const agentsInCalls = new Set(highLevelCalls.map(c => c.agentId).filter(Boolean));
    const unassignedAgents = Array.from(agentsInCalls).filter(id => !assignedAgentHLIds.has(id));

    const agentAnalysis = {
      totalAgentsInCalls: agentsInCalls.size,
      assignedToUser: assignedAgentHLIds.size,
      unassignedAgents: unassignedAgents.map(hlId => ({
        highlevelId: hlId,
        name: agentMap.get(hlId)?.name || 'Unknown',
        inSystem: agentMap.has(hlId),
        callCount: highLevelCalls.filter(c => c.agentId === hlId).length,
      })),
    };

    const diagnosticDuration = Date.now() - diagnosticStartTime;

    // Build response
    const response: any = {
      summary: {
        dateRange: { start: effectiveStartDate, end: effectiveEndDate },
        highlevelTotal: highLevelCalls.length,
        databaseTotal: dbCalls?.length || 0,
        matching: matching.length,
        missingInDatabase: missingInDB.length,
        extraInDatabase: missingInHL.length,
        pagesFetched: page,
      },
      missingCalls: missingInDB,
      extraCalls: missingInHL.length > 0 ? missingInHL : undefined,
      reasonBreakdown: reasonCounts,
      agentAnalysis,
      diagnosticDuration_ms: diagnosticDuration,
    };

    if (includeRawData) {
      response.rawData = {
        highlevelCalls: highLevelCalls,
        databaseCalls: dbCalls,
      };
    }

    // Log diagnostic run
    await supabase
      .from('call_sync_logs')
      .insert({
        user_id: userId,
        sync_started_at: new Date(diagnosticStartTime).toISOString(),
        sync_completed_at: new Date().toISOString(),
        sync_type: 'diagnostic',
        sync_status: 'success',
        api_params: {
          startDate: effectiveStartDate,
          endDate: effectiveEndDate,
          locationId: oauthData.location_id,
        },
        api_response_summary: {
          totalFetched: highLevelCalls.length,
          pageCount: page,
        },
        processing_summary: {
          highlevelTotal: highLevelCalls.length,
          databaseTotal: dbCalls?.length || 0,
          matching: matching.length,
          missingInDatabase: missingInDB.length,
          reasonBreakdown: reasonCounts,
        },
        skipped_calls: missingInDB,
        duration_ms: diagnosticDuration,
      });

    return new Response(
      JSON.stringify(response),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[DIAGNOSTIC] Error:", error);

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
        details: error,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
