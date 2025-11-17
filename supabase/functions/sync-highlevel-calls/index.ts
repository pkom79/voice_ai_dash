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

    const {
      userId,
      startDate,
      endDate,
      syncType = 'manual',
      timezone = 'America/New_York',
      adminOverride = false,
      adminUserId
    }: SyncCallsRequest = await req.json();

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
        start_date_requested: startDate || null,
        end_date_requested: endDate || null,
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

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "userId is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data: oauthData, error: oauthError } = await supabase
      .from("api_keys")
      .select("access_token, refresh_token, token_expires_at, location_id")
      .eq("user_id", userId)
      .eq("service", "highlevel")
      .eq("is_active", true)
      .maybeSingle();

    if (oauthError || !oauthData) {
      const errorMsg = "No valid OAuth connection found";
      syncLogger.logs.push(`[ERROR] ${errorMsg}`);

      if (syncLogId) {
        await supabase
          .from('call_sync_logs')
          .update({
            sync_status: 'failed',
            sync_completed_at: new Date().toISOString(),
            error_message: errorMsg,
            logs: syncLogger.logs,
          })
          .eq('id', syncLogId);
      }

      return new Response(
        JSON.stringify({ error: errorMsg }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

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
              error_message: errorMsg,
              logs: syncLogger.logs,
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

      let page = 1;
      const limit = 100;
      let hasMore = true;

      while (hasMore) {
        const queryParams = new URLSearchParams({
          ...baseParams,
          startDate: chunk.start,
          endDate: chunk.end,
          timezone: timezone,
          limit: limit.toString(),
          page: page.toString(),
        });

        const apiUrl = `https://services.leadconnectorhq.com/voice-ai/dashboard/call-logs?${queryParams}`;
        const apiCallStart = Date.now();

        syncLogger.logs.push(`[API REQUEST] Page ${page}, Limit ${limit}, Date Range: ${chunk.start} to ${chunk.end}, Timezone: ${timezone}`);

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
                error_message: errorMsg,
                logs: syncLogger.logs,
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
          page: page,
          limit,
          callsReturned: calls.length,
          apiTime: apiCallTime,
          dateRange: `${chunk.start} to ${chunk.end}`,
          timezone: timezone,
        });

        syncLogger.logs.push(`[API RESPONSE] Page ${page} returned ${calls.length} calls`);

        for (const call of calls) {
          if (!callsById.has(call.id)) {
            callsById.set(call.id, call);
            allRawCalls.push(call);
          }
        }

        if (calls.length < limit) {
          hasMore = false;
        } else {
          page++;
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
          .eq("call_id", rawCall.id)
          .maybeSingle();

        const durationSeconds = rawCall.duration || 0;
        const { cost, displayCost } = calculateCallCost(durationSeconds, direction, billingAccount);

        const callData = {
          call_id: rawCall.id,
          user_id: userId,
          agent_id: rawCall.agent_id || rawCall.agentId,
          contact_id: rawCall.contact_id || rawCall.contactId,
          from_number: fromNumber,
          to_number: toNumber,
          direction: direction,
          status: rawCall.status,
          duration: durationSeconds,
          started_at: rawCall.started_at ? new Date(rawCall.started_at).toISOString() : null,
          ended_at: rawCall.ended_at ? new Date(rawCall.ended_at).toISOString() : null,
          recording_url: rawCall.recording_url || rawCall.recordingUrl || null,
          transcript: rawCall.transcript || null,
          call_cost: cost,
          cost_display: displayCost,
          business_phone_number: rawCall.business_phone_number || null,
          message_id: rawCall.message_id || null,
        };

        if (existingCall) {
          await supabase
            .from("calls")
            .update(callData)
            .eq("call_id", rawCall.id);
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
          calls_fetched: allRawCalls.length,
          calls_inserted: insertedCount,
          calls_updated: updatedCount,
          calls_skipped: skippedCount,
          api_time_ms: totalApiTime,
          total_time_ms: syncDuration,
          logs: syncLogger.logs,
          skip_reasons: syncLogger.skipReasons,
          api_pages: syncLogger.apiPages,
          skipped_calls_sample: syncLogger.skippedCalls.slice(0, 50),
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
    console.error("Error syncing calls:", error);

    if (syncLogId) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      await supabase
        .from('call_sync_logs')
        .update({
          sync_status: 'failed',
          sync_completed_at: new Date().toISOString(),
          error_message: error.message,
        })
        .eq('id', syncLogId);
    }

    return new Response(
      JSON.stringify({ error: "Internal server error", details: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
