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

// Calculate cost based on duration, direction, and billing plan
function calculateCallCost(
  durationSeconds: number,
  direction: string,
  billingAccount: any
): { cost: number; displayCost: string | null } {
  // No billing account means no cost
  if (!billingAccount) {
    return { cost: 0, displayCost: null };
  }

  // Unlimited inbound plan - inbound calls are included
  if (direction === 'inbound' && billingAccount.inbound_plan === 'unlimited') {
    return { cost: 0, displayCost: 'INCLUDED' };
  }

  // Calculate cost based on direction and rate
  const durationMinutes = durationSeconds / 60;
  let rateCents = 0;

  if (direction === 'inbound' && billingAccount.inbound_rate_cents) {
    rateCents = billingAccount.inbound_rate_cents;
  } else if (direction === 'outbound' && billingAccount.outbound_rate_cents) {
    rateCents = billingAccount.outbound_rate_cents;
  }

  // Cost = (duration in minutes) * (rate in cents) / 100 (convert to dollars)
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

    // Initialize sync log
    const syncLogger: SyncLogger = {
      logId: crypto.randomUUID(),
      startTime: syncStartTime,
      logs: [],
      skippedCalls: [],
      skipReasons: {},
      apiPages: [],
    };

    // Create sync log entry in database
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
    console.log(`Starting sync for user ${userId}`);

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "userId is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Get OAuth credentials
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

    // Get user's billing account information for cost calculation
    const { data: billingAccount, error: billingError } = await supabase
      .from("billing_accounts")
      .select("inbound_rate_cents, outbound_rate_cents, inbound_plan, calls_reset_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (billingError) {
      console.error("Billing account error:", billingError);
    }

    console.log("User billing account:", billingAccount);

    // Check if token is expired
    let accessToken = oauthData.access_token;
    if (new Date(oauthData.token_expires_at) <= new Date()) {
      console.log("Access token expired, refreshing...");
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

    // Apply startDate filter based on calls_reset_at or provided startDate
    let effectiveStartDate = startDate;
    let originalResetDate: string | null = null;

    if (adminOverride) {
      // Admin override: use provided dates directly, bypass calls_reset_at
      effectiveStartDate = startDate;
      originalResetDate = billingAccount?.calls_reset_at || null;
      syncLogger.logs.push(`[ADMIN OVERRIDE] Bypassing calls_reset_at restriction`);
      if (originalResetDate) {
        syncLogger.logs.push(`[ADMIN OVERRIDE] Original calls_reset_at: ${originalResetDate}`);
      }
      console.log(`Admin override enabled - using provided dates directly`);
    } else if (billingAccount?.calls_reset_at) {
      // Normal sync: respect calls_reset_at
      const resetDate = new Date(billingAccount.calls_reset_at).toISOString();
      if (!startDate || new Date(resetDate) > new Date(startDate)) {
        effectiveStartDate = resetDate;
        syncLogger.logs.push(`[DATE] Using calls_reset_at as startDate filter: ${resetDate}`);
        console.log(`Using calls_reset_at as startDate filter: ${resetDate}`);
      }
    }

    // Update sync log with original_reset_date if admin override
    if (adminOverride && originalResetDate && syncLogId) {
      await supabase
        .from('call_sync_logs')
        .update({ original_reset_date: originalResetDate })
        .eq('id', syncLogId);
    }

    // Build base query params
    const baseParams: Record<string, string> = {};
    if (oauthData.location_id) {
      baseParams.locationId = oauthData.location_id;
    }
    if (effectiveStartDate) baseParams.startDate = effectiveStartDate;
    if (endDate) baseParams.endDate = endDate;
    // Add timezone parameter for HighLevel API
    if (timezone) baseParams.timezone = timezone;

    syncLogger.logs.push(`[API] Location: ${oauthData.location_id}, Start: ${effectiveStartDate || 'none'}, End: ${endDate || 'none'}, Timezone: ${timezone}`);

    // Fetch calls from HighLevel with smart chunking
    const allRawCalls: any[] = [];
    const callsById = new Map<string, any>();
    let totalApiTime = 0;

    // Calculate the date range to fetch
    const rangeStartDate = effectiveStartDate ? new Date(effectiveStartDate) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const rangeEndDate = endDate ? new Date(endDate) : new Date();

    // Split into daily chunks
    const chunks: Array<{ start: string; end: string }> = [];
    let currentDate = new Date(rangeStartDate);

    while (currentDate <= rangeEndDate) {
      const chunkStart = new Date(currentDate);
      const chunkEnd = new Date(currentDate);
      chunkEnd.setHours(23, 59, 59, 999);

      // Don't go past the overall end date
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

    console.log(`Fetching calls in ${chunks.length} daily chunks`);
    syncLogger.logs.push(`[CHUNKING] Date range split into ${chunks.length} daily chunks`);

    // Process each chunk
    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
      const chunk = chunks[chunkIndex];
      console.log(`Processing chunk ${chunkIndex + 1}/${chunks.length}: ${chunk.start} to ${chunk.end}`);

      let skip = 0;
      const limit = 100;
      let hasMore = true;

      while (hasMore) {
        const queryParams = new URLSearchParams({
          ...baseParams,
          startDate: chunk.start,
          endDate: chunk.end,
          limit: limit.toString(),
          skip: skip.toString(),
        });

        const apiUrl = `https://services.leadconnectorhq.com/voice-ai/calls?${queryParams}`;
        const apiCallStart = Date.now();

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
          page: Math.floor(skip / limit) + 1,
          skip,
          limit,
          callsReturned: calls.length,
          apiTime: apiCallTime,
          dateRange: `${chunk.start} to ${chunk.end}`,
        });

        console.log(`Chunk ${chunkIndex + 1}, Page ${Math.floor(skip / limit) + 1}: Got ${calls.length} calls in ${apiCallTime}ms`);

        // Add unique calls to collection
        for (const call of calls) {
          if (!callsById.has(call.id)) {
            callsById.set(call.id, call);
            allRawCalls.push(call);
          }
        }

        // Check if there are more results
        if (calls.length < limit) {
          hasMore = false;
        } else {
          skip += limit;
        }
      }
    }

    console.log(`Fetched ${allRawCalls.length} total calls from HighLevel in ${totalApiTime}ms`);
    syncLogger.logs.push(`[FETCH] Retrieved ${allRawCalls.length} total calls from HighLevel (${totalApiTime}ms)`);

    // Process and store calls
    let insertedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    for (const rawCall of allRawCalls) {
      try {
        // Skip test calls - improved detection
        const fromNumber = rawCall.from_number || rawCall.fromNumber || '';
        const toNumber = rawCall.to_number || rawCall.toNumber || '';
        const direction = rawCall.direction || '';

        // Skip if no from_number (common for test calls)
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

        // Trust HighLevel's is_test_call flag
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

        // Check if call already exists
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

    // Update sync log with final status
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

    console.log(`Sync completed: ${insertedCount} inserted, ${updatedCount} updated, ${skippedCount} skipped`);

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
