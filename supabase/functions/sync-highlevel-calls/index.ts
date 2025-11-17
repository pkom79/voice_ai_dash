import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

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

function calculateCallCost(
  durationSeconds: number,
  direction: string,
  billingAccount: any
): { cost: number; displayCost: string | null } {
  if (!billingAccount) {
    return { cost: 0, displayCost: null };
  }

  if (direction === 'inbound' && billingAccount.inbound_plan === 'unlimited') {
    return { cost: 0, displayCost: 'INCLUDED' };
  }

  const durationMinutes = durationSeconds / 60;
  let rateCents = 0;

  if (direction === 'inbound' && billingAccount.inbound_rate_cents) {
    rateCents = billingAccount.inbound_rate_cents;
  } else if (direction === 'outbound' && billingAccount.outbound_rate_cents) {
    rateCents = billingAccount.outbound_rate_cents;
  }

  const cost = (durationMinutes * rateCents) / 100;
  return { cost: parseFloat(cost.toFixed(2)), displayCost: null };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  const syncStartTime = Date.now();
  let syncLogId: string | null = null;

  try {
    console.log("[SYNC] Function invoked");

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

    console.log(`[SYNC] Parameters validated - userId: ${userId}, syncType: ${syncType}, adminOverride: ${adminOverride}`);

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
        sync_type: syncType,
        sync_status: 'in_progress',
        timezone_used: timezone,
        admin_override: adminOverride,
        admin_user_id: adminUserId || null,
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

    syncLogger.logs.push(`[START] Sync initiated - Type: ${syncType}, Admin Override: ${adminOverride}`);

    console.log(`[SYNC] Looking up OAuth connection for user ${userId}`);
    const { data: oauthData, error: oauthError } = await supabase
      .from("api_keys")
      .select("access_token, refresh_token, token_expires_at, location_id")
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

    const { data: billingAccount, error: billingError } = await supabase
      .from("billing_accounts")
      .select("inbound_rate_cents, outbound_rate_cents, inbound_plan, calls_reset_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (billingError) {
      console.error("Billing account error:", billingError);
    }

    let accessToken = oauthData.access_token;
    if (new Date(oauthData.token_expires_at) <= new Date()) {
      syncLogger.logs.push(`[AUTH] Access token expired, refreshing...`);

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
        const errorMsg = "Failed to refresh access token";
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

      const refreshData = await refreshResponse.json();
      accessToken = refreshData.access_token;
    }

    let effectiveStartDate = startDate;
    let originalResetDate: string | null = null;

    if (adminOverride) {
      effectiveStartDate = startDate;
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

    const baseParams: Record<string, string> = {};
    if (oauthData.location_id) {
      baseParams.locationId = oauthData.location_id;
    }
    if (effectiveStartDate) baseParams.startDate = effectiveStartDate;
    if (effectiveEndDate) baseParams.endDate = effectiveEndDate;
    baseParams.timezone = timezone;

    syncLogger.logs.push(`[API] Location: ${oauthData.location_id}, Start: ${effectiveStartDate || 'none'}, End: ${effectiveEndDate}, Timezone: ${timezone}`);
    console.log(`[SYNC] Preparing to fetch calls - Start: ${effectiveStartDate}, End: ${effectiveEndDate}, Timezone: ${timezone}`);

    const allRawCalls: any[] = [];
    const callsById = new Map<string, any>();
    let totalApiTime = 0;

    const rangeStartDate = effectiveStartDate ? new Date(effectiveStartDate) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const rangeEndDate = new Date(effectiveEndDate);

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

    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
      const chunk = chunks[chunkIndex];

      const queryParams = new URLSearchParams({
        ...baseParams,
        startDate: chunk.start,
        endDate: chunk.end,
        timezone: timezone,
      });

      const apiUrl = `https://services.leadconnectorhq.com/voice-ai/dashboard/call-logs?${queryParams}`;
      const apiCallStart = Date.now();

      syncLogger.logs.push(`[API REQUEST] Date Range: ${chunk.start} to ${chunk.end}, Timezone: ${timezone}`);
      console.log(`[SYNC] Calling HighLevel API: ${apiUrl}`);

      const response = await fetch(apiUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Version: "2021-07-28",
        },
      });

      const apiCallTime = Date.now() - apiCallStart;
      totalApiTime += apiCallTime;

      if (!response.ok) {
        const errorText = await response.text();
        const errorMsg = `HighLevel API error: ${response.status}`;
        console.error(errorMsg, errorText);
        syncLogger.logs.push(`[ERROR] ${errorMsg}: ${errorText}`);

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
          JSON.stringify({ error: errorMsg, details: errorText }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const data = await response.json();
      const calls = data.calls || [];

      syncLogger.apiPages.push({
        chunk: `${chunkIndex + 1}/${chunks.length}`,
        callsReturned: calls.length,
        apiTime: apiCallTime,
        dateRange: `${chunk.start} to ${chunk.end}`,
        timezone: timezone,
      });

      syncLogger.logs.push(`[API RESPONSE] Chunk ${chunkIndex + 1}/${chunks.length} returned ${calls.length} calls`);

      for (const call of calls) {
        if (!callsById.has(call.id)) {
          callsById.set(call.id, call);
          allRawCalls.push(call);
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
        const direction = rawCall.direction || '';

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

        const { data: existingCall } = await supabase
          .from("calls")
          .select("id")
          .eq("highlevel_call_id", rawCall.id)
          .maybeSingle();

        const durationSeconds = rawCall.duration || 0;
        const { cost, displayCost } = calculateCallCost(durationSeconds, direction, billingAccount);

        const callData = {
          highlevel_call_id: rawCall.id,
          user_id: userId,
          agent_id: rawCall.agent_id || rawCall.agentId,
          contact_id: rawCall.contact_id || rawCall.contactId,
          from_number: fromNumber,
          to_number: toNumber,
          direction: direction,
          status: rawCall.status,
          duration_seconds: durationSeconds,
          call_started_at: rawCall.createdAt ? new Date(rawCall.createdAt).toISOString() : null,
          call_ended_at: rawCall.ended_at ? new Date(rawCall.ended_at).toISOString() : null,
          recording_url: rawCall.recording_url || rawCall.recordingUrl || null,
          transcript: rawCall.transcript || null,
          cost: cost,
          display_cost: displayCost,
          message_id: rawCall.message_id || null,
          location_id: oauthData.location_id,
          is_test_call: rawCall.trialCall || false,
          summary: rawCall.summary || null,
        };

        if (existingCall) {
          await supabase
            .from("calls")
            .update(callData)
            .eq("highlevel_call_id", rawCall.id);
          updatedCount++;
        } else {
          await supabase
            .from("calls")
            .insert(callData);
          insertedCount++;
        }
      } catch (error) {
        console.error(`Error processing call ${rawCall.id}:`, error);
        syncLogger.logs.push(`[ERROR] Failed to process call ${rawCall.id}: ${error.message}`);
      }
    }

    const syncDuration = Date.now() - syncStartTime;
    syncLogger.logs.push(`[COMPLETE] Inserted: ${insertedCount}, Updated: ${updatedCount}, Skipped: ${skippedCount}, Duration: ${syncDuration}ms`);

    if (syncLogId) {
      await supabase
        .from('call_sync_logs')
        .update({
          sync_status: 'completed',
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
    }

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