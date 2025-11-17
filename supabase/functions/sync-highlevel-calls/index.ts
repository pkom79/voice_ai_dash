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
  syncType?: 'manual' | 'auto';
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

    const { userId, startDate, endDate, syncType = 'manual' }: SyncCallsRequest = await req.json();

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
      })
      .select('id')
      .single();

    if (syncLogData) {
      syncLogId = syncLogData.id;
      syncLogger.logs.push(`[INIT] Sync log created: ${syncLogId}`);
    }

    syncLogger.logs.push(`[START] User: ${userId}, Type: ${syncType}, Date Range: ${startDate || 'auto'} to ${endDate || 'now'}`);

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "userId is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Get OAuth token for user
    const { data: oauthData, error: oauthError } = await supabase
      .from("api_keys")
      .select("access_token, refresh_token, token_expires_at, location_id")
      .eq("user_id", userId)
      .eq("service", "highlevel")
      .eq("is_active", true)
      .maybeSingle();

    if (oauthError || !oauthData) {
      console.error("OAuth error:", oauthError);
      return new Response(
        JSON.stringify({ error: "No valid OAuth connection found", details: oauthError }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    let accessToken = oauthData.access_token;

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
    if (new Date(oauthData.token_expires_at) <= new Date()) {
      console.log("Token expired, refreshing...");
      
      // Refresh token
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
        const refreshError = await refreshResponse.text();
        console.error("Refresh failed:", refreshError);
        return new Response(
          JSON.stringify({ error: "Failed to refresh token", details: refreshError }),
          {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const refreshData = await refreshResponse.json();
      accessToken = refreshData.access_token;
    }

    // Apply startDate filter based on calls_reset_at or provided startDate
    let effectiveStartDate = startDate;
    if (billingAccount?.calls_reset_at) {
      const resetDate = new Date(billingAccount.calls_reset_at).toISOString();
      if (!startDate || new Date(resetDate) > new Date(startDate)) {
        effectiveStartDate = resetDate;
        syncLogger.logs.push(`[DATE] Using calls_reset_at as startDate filter: ${resetDate}`);
        console.log(`Using calls_reset_at as startDate filter: ${resetDate}`);
      }
    }

    // Build base query params
    const baseParams: Record<string, string> = {};
    if (oauthData.location_id) {
      baseParams.locationId = oauthData.location_id;
    }
    if (effectiveStartDate) baseParams.startDate = effectiveStartDate;
    if (endDate) baseParams.endDate = endDate;

    syncLogger.logs.push(`[API] Location: ${oauthData.location_id}, Start: ${effectiveStartDate || 'none'}, End: ${endDate || 'none'}`);

    // Fetch calls with pagination support
    const allCalls: any[] = [];
    let page = 0;
    let hasMorePages = true;
    const pageSize = 100; // Adjust based on HL API limits
    const maxPages = 50; // Safety limit to prevent infinite loops

    while (hasMorePages && page < maxPages) {
      const params = new URLSearchParams(baseParams);
      params.append("limit", pageSize.toString());
      params.append("skip", (page * pageSize).toString());

      const highLevelUrl = `https://services.leadconnectorhq.com/voice-ai/dashboard/call-logs?${params.toString()}`;

      syncLogger.logs.push(`[API] Fetching page ${page + 1} (skip: ${page * pageSize}, limit: ${pageSize})`);
      console.log(`[PAGINATION] Fetching page ${page + 1}:`, highLevelUrl);

      const pageStartTime = Date.now();
      const callsResponse = await fetch(highLevelUrl, {
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "Version": "2021-07-28",
        },
      });

      const pageDuration = Date.now() - pageStartTime;

      if (!callsResponse.ok) {
        const errorText = await callsResponse.text();
        syncLogger.logs.push(`[ERROR] API request failed: ${callsResponse.status} ${errorText}`);
        console.error("HighLevel API error:", callsResponse.status, errorText);

        // Update sync log with error
        if (syncLogId) {
          await supabase
            .from('call_sync_logs')
            .update({
              sync_completed_at: new Date().toISOString(),
              sync_status: 'failed',
              error_details: { status: callsResponse.status, message: errorText },
              duration_ms: Date.now() - syncStartTime,
            })
            .eq('id', syncLogId);
        }

        return new Response(
          JSON.stringify({
            error: `HighLevel API error: ${callsResponse.statusText}`,
            details: errorText,
          }),
          {
            status: callsResponse.status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const pageData = await callsResponse.json();
      const pageCalls = pageData.callLogs || [];

      syncLogger.apiPages.push({
        page: page + 1,
        callsReceived: pageCalls.length,
        duration_ms: pageDuration,
        timestamp: new Date().toISOString(),
      });

      syncLogger.logs.push(`[API] Page ${page + 1} received: ${pageCalls.length} calls (${pageDuration}ms)`);
      console.log(`[PAGINATION] Page ${page + 1}: ${pageCalls.length} calls`);

      allCalls.push(...pageCalls);

      // Check if there are more pages
      hasMorePages = pageCalls.length === pageSize;
      page++;

      // Rate limiting: wait between requests
      if (hasMorePages && page < maxPages) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    syncLogger.logs.push(`[API] Pagination complete: ${allCalls.length} total calls across ${page} page(s)`);
    console.log(`[PAGINATION] Complete: ${allCalls.length} total calls across ${page} pages`);

    const callsData = { callLogs: allCalls };

    // Get user's assigned agents to filter calls
    const { data: userAgents, error: userAgentsError } = await supabase
      .from('user_agents')
      .select('agent_id, agents(highlevel_agent_id)')
      .eq('user_id', userId);

    if (userAgentsError) {
      console.error("Error fetching user agents:", userAgentsError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch user agents", details: userAgentsError }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const assignedAgentHighLevelIds = new Set(
      userAgents?.map(ua => (ua.agents as any)?.highlevel_agent_id).filter(Boolean) || []
    );

    console.log(`User has ${assignedAgentHighLevelIds.size} assigned agents:`, Array.from(assignedAgentHighLevelIds));

    // Process and save calls to database
    let savedCount = 0;
    let errorCount = 0;
    let skippedCount = 0;
    const errors: any[] = [];
    const skippedCalls: any[] = []; // Track skipped calls with reasons
    let totalCostAdded = 0; // Track total cost for billing update

    syncLogger.logs.push(`[FILTER] User has ${assignedAgentHighLevelIds.size} assigned agents: ${Array.from(assignedAgentHighLevelIds).join(', ')}`);
    console.log(`User has ${assignedAgentHighLevelIds.size} assigned agents:`, Array.from(assignedAgentHighLevelIds));

    if (callsData.callLogs && Array.isArray(callsData.callLogs)) {
      syncLogger.logs.push(`[PROCESS] Starting to process ${callsData.callLogs.length} calls`);
      console.log(`Processing ${callsData.callLogs.length} calls...`);
      if (callsData.callLogs[0]) {
        console.log('First call detailed sample:', JSON.stringify(callsData.callLogs[0], null, 2));
      }

      for (const call of callsData.callLogs) {
        try {
          // Determine direction - map any possible API values to our schema
          let direction = 'inbound'; // default
          if (call.direction) {
            const dir = call.direction.toLowerCase();
            if (dir === 'outbound' || dir === 'outgoing') {
              direction = 'outbound';
            } else if (dir === 'inbound' || dir === 'incoming') {
              direction = 'inbound';
            }
          }

          // Handle agent - verify and update agent record if agentId exists
          let agentDbId = null;
          if (call.agentId) {
            // Extract agent name from various possible fields in the API response
            const agentName = call.agentName || call.agent_name || call.agent?.name || null;

            console.log(`Processing agent - ID: ${call.agentId}, Name: ${agentName}`);

            // Check if agent exists in database
            const { data: existingAgent } = await supabase
              .from('agents')
              .select('id, name, is_active')
              .eq('highlevel_agent_id', call.agentId)
              .maybeSingle();

            if (existingAgent) {
              agentDbId = existingAgent.id;

              // Update agent details during sync
              const updates: any = {
                last_verified_at: new Date().toISOString(),
                is_active: true, // Mark as active since we're seeing it in call data
              };

              // Update agent name if HighLevel provides a valid name and it differs
              if (agentName && agentName.trim() !== '' && agentName !== existingAgent.name) {
                console.log(`Updating agent name from "${existingAgent.name}" to "${agentName}"`);
                updates.name = agentName;
              }

              // Apply updates
              await supabase
                .from('agents')
                .update(updates)
                .eq('id', existingAgent.id);

              // Auto-assign agent to user if not already assigned
              // This ensures the user can see calls from all agents that are actively making calls
              if (!assignedAgentHighLevelIds.has(call.agentId)) {
                console.log(`Auto-assigning agent ${call.agentId} to user ${userId} based on call activity`);
                const { error: assignError } = await supabase.rpc('auto_assign_agent_to_user', {
                  p_user_id: userId,
                  p_agent_id: agentDbId,
                });

                if (assignError) {
                  console.error(`Error auto-assigning agent:`, assignError);
                } else {
                  // Add to the set so we don't try to assign again in this sync
                  assignedAgentHighLevelIds.add(call.agentId);
                  console.log(`Successfully auto-assigned agent ${call.agentId} to user ${userId}`);
                }
              }
            } else {
              // Agent not in database - skip this call since agents must be explicitly assigned
              const skipReason = 'agent_not_in_system';
              const skipDetail = {
                callId: call.id,
                reason: skipReason,
                agentId: call.agentId,
                fromNumber: call.fromNumber || call.from || '',
                callTime: call.createdAt,
                contactName: call.contactName,
                message: `Agent ${call.agentId} not found in database`,
              };

              syncLogger.logs.push(`[SKIP] Call ${call.id}: ${skipDetail.message}`);
              console.log(`Skipping call ${call.id} - ${skipDetail.message}`);

              syncLogger.skippedCalls.push(skipDetail);
              syncLogger.skipReasons[skipReason] = (syncLogger.skipReasons[skipReason] || 0) + 1;

              skippedCalls.push(skipDetail);
              skippedCount++;
              continue;
            }
          }

          // Fetch contact name if we have a contactId
          let contactName = null;
          if (call.contactId && oauthData.location_id) {
            try {
              const contactResponse = await fetch(
                `https://services.leadconnectorhq.com/contacts/${call.contactId}`,
                {
                  headers: {
                    "Authorization": `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                    "Version": "2021-07-28",
                  },
                }
              );

              if (contactResponse.ok) {
                const contactData = await contactResponse.json();
                contactName = contactData.contact?.name || contactData.contact?.firstName
                  ? `${contactData.contact?.firstName || ''} ${contactData.contact?.lastName || ''}`.trim()
                  : null;
              }
            } catch (contactError) {
              console.warn(`Could not fetch contact ${call.contactId}:`, contactError);
            }
          }

          // Extract message_id and location_id for recording access
          // These fields are needed for the Conversations API recording endpoint
          const messageId = call.messageId || call.message_id || call.conversationMessageId || null;
          const locationId = call.locationId || call.location_id || oauthData.location_id || null;

          if (messageId) {
            console.log(`Call ${call.id} has messageId: ${messageId}, locationId: ${locationId}`);
          } else {
            console.log(`Call ${call.id} missing messageId - recording may not be available`);
          }

          // Calculate cost based on duration, direction, and billing plan
          const durationSeconds = call.duration || call.durationInSeconds || 0;
          const { cost, displayCost } = calculateCallCost(durationSeconds, direction, billingAccount);

          console.log(`Call ${call.id}: duration=${durationSeconds}s, direction=${direction}, cost=$${cost}, display=${displayCost}`);

          // Determine if this is a test call
          // Prioritize HighLevel's explicit isTestCall flag if provided
          // Only fall back to fromNumber check if HighLevel doesn't specify
          const fromNumber = call.fromNumber || call.from || '';
          const toNumber = call.toNumber || call.to || '';
          const isTestCall = call.isTestCall === true || call.isTestCall === 'true';

          // Determine which phone number is "our" business phone number
          // For inbound calls: toNumber is our phone (customer called us)
          // For outbound calls: fromNumber is our phone (we called customer)
          const ourPhoneNumber = direction === 'inbound' ? toNumber : fromNumber;

          // Look up phone_number_id from our database
          let phoneNumberId = null;
          if (ourPhoneNumber) {
            const { data: phoneNumberData } = await supabase
              .from('phone_numbers')
              .select('id')
              .eq('phone_number', ourPhoneNumber)
              .maybeSingle();

            if (phoneNumberData) {
              phoneNumberId = phoneNumberData.id;
              console.log(`Matched phone number ${ourPhoneNumber} to phone_number_id: ${phoneNumberId}`);
            } else {
              console.log(`Phone number ${ourPhoneNumber} not found in phone_numbers table`);
            }
          }

          // Map HighLevel call data to our schema
          const callRecord = {
            highlevel_call_id: call.id,
            user_id: userId,
            agent_id: agentDbId,
            phone_number_id: phoneNumberId,
            direction: direction,
            contact_name: contactName,
            from_number: fromNumber,
            to_number: toNumber,
            status: call.status,
            duration_seconds: durationSeconds,
            cost: cost,
            display_cost: displayCost,
            action_triggered: call.actionTriggered,
            sentiment: call.sentiment,
            summary: call.summary,
            transcript: call.transcript,
            recording_url: call.recordingUrl || call.recordingLink || call.recording_url,
            message_id: messageId,
            location_id: locationId,
            workflow_names: call.workflowNames,
            notes: call.notes,
            tags: call.tags,
            latency_ms: call.latency,
            is_test_call: isTestCall,
            call_started_at: call.createdAt,
            call_ended_at: call.endTime || call.completedAt,
            metadata: call,
          };

          console.log(`Attempting to upsert call ${call.id}:`, JSON.stringify(callRecord, null, 2));

          // Upsert call (insert or update if exists)
          const { data: upsertedCall, error: upsertError } = await supabase
            .from('calls')
            .upsert(callRecord, {
              onConflict: 'highlevel_call_id',
              ignoreDuplicates: false,
            })
            .select('id')
            .single();

          if (upsertError) {
            syncLogger.logs.push(`[ERROR] Failed to save call ${call.id}: ${upsertError.message}`);
            console.error('Error upserting call:', call.id, upsertError);
            errors.push({ callId: call.id, error: upsertError.message, details: upsertError });
            errorCount++;
          } else {
            syncLogger.logs.push(`[SAVE] Successfully saved call ${call.id} (agent: ${agentDbId})`);
            console.log(`Successfully saved call ${call.id}`);
            savedCount++;

            // Create usage log entry for paid calls (not INCLUDED)
            if (cost > 0 && displayCost !== 'INCLUDED' && upsertedCall) {
              const costCents = Math.round(cost * 100);
              const { error: usageLogError } = await supabase
                .from('usage_logs')
                .upsert(
                  {
                    user_id: userId,
                    call_id: upsertedCall.id,
                    cost_cents: costCents,
                    usage_type: direction,
                    created_at: call.createdAt || new Date().toISOString(),
                  },
                  {
                    onConflict: 'call_id',
                    ignoreDuplicates: false,
                  }
                );

              if (usageLogError) {
                console.error(`Error creating usage log for call ${call.id}:`, usageLogError);
              } else {
                totalCostAdded += costCents;
                console.log(`Created usage log entry: $${cost} (${costCents} cents)`);
              }
            }
          }
        } catch (callError) {
          syncLogger.logs.push(`[ERROR] Exception processing call ${call.id}: ${callError instanceof Error ? callError.message : 'Unknown'}`);
          console.error('Error processing call:', call.id, callError);
          errors.push({ callId: call.id, error: callError instanceof Error ? callError.message : 'Unknown error' });
          errorCount++;
        }
      }
    }

    const syncDuration = Date.now() - syncStartTime;
    syncLogger.logs.push(`[COMPLETE] Sync finished: ${savedCount} saved, ${skippedCount} skipped, ${errorCount} errors (${syncDuration}ms)`);
    console.log(`Sync complete: ${savedCount} calls saved, ${skippedCount} skipped (unassigned agents), ${errorCount} errors`);

    if (errors.length > 0) {
      syncLogger.logs.push(`[ERRORS] ${errors.length} errors encountered`);
      console.error('Errors encountered:', JSON.stringify(errors, null, 2));
    }
    if (skippedCalls.length > 0) {
      syncLogger.logs.push(`[SKIPPED] ${skippedCalls.length} calls skipped - reasons: ${JSON.stringify(syncLogger.skipReasons)}`);
      console.warn('Skipped calls details:', JSON.stringify(skippedCalls, null, 2));
    }

    // Update sync log with final results
    if (syncLogId) {
      const syncStatus = errorCount > 0 ? 'partial' : 'success';
      await supabase
        .from('call_sync_logs')
        .update({
          sync_completed_at: new Date().toISOString(),
          sync_status: syncStatus,
          api_params: baseParams,
          api_response_summary: {
            totalFetched: allCalls.length,
            pageCount: page,
            pagesDetails: syncLogger.apiPages,
            dateRangeCovered: { start: effectiveStartDate, end: endDate },
          },
          processing_summary: {
            saved: savedCount,
            skipped: skippedCount,
            errors: errorCount,
            skipReasons: syncLogger.skipReasons,
            totalCostAdded: totalCostAdded / 100,
          },
          skipped_calls: syncLogger.skippedCalls,
          error_details: errors.length > 0 ? { errors } : null,
          duration_ms: syncDuration,
        })
        .eq('id', syncLogId);

      syncLogger.logs.push(`[LOG] Sync log updated: ${syncLogId}`);
    }

    // Log sync activity
    await supabase.rpc('log_user_activity', {
      p_user_id: userId,
      p_event_type: 'system_event',
      p_event_category: 'sync',
      p_event_name: 'Call Sync Completed',
      p_description: `Synced ${savedCount} calls from HighLevel (${skippedCount} skipped, ${errorCount} errors)`,
      p_metadata: {
        savedCount,
        skippedCount,
        errorCount,
        totalFetched: callsData.callLogs?.length || 0,
        startDate: effectiveStartDate,
        endDate,
        totalCostAdded: totalCostAdded / 100,
        skippedCalls: skippedCalls.length > 0 ? skippedCalls : undefined,
      },
      p_severity: errorCount > 0 ? 'warning' : 'info',
    });

    // Log sync errors if any
    if (errorCount > 0 && errors.length > 0) {
      for (const error of errors.slice(0, 5)) { // Log first 5 errors
        await supabase.rpc('log_integration_error', {
          p_user_id: userId,
          p_error_type: 'call_sync_error',
          p_error_source: 'highlevel_api',
          p_error_message: error.error || 'Unknown sync error',
          p_error_code: 'CALL_SYNC_ERROR',
          p_request_data: { callId: error.callId },
          p_response_data: error.details || {},
        });
      }
    }

    // Update billing account's month_spent_cents with total cost from this sync
    if (totalCostAdded > 0 && billingAccount) {
      console.log(`Updating billing account: adding ${totalCostAdded} cents to month_spent_cents`);
      const { error: billingUpdateError } = await supabase
        .from('billing_accounts')
        .update({
          month_spent_cents: (billingAccount.month_spent_cents || 0) + totalCostAdded,
        })
        .eq('user_id', userId);

      if (billingUpdateError) {
        console.error('Error updating billing account:', billingUpdateError);
      } else {
        console.log(`Successfully updated month_spent_cents`);
      }
    }

    // Return the sync results to the client
    return new Response(
      JSON.stringify({
        success: true,
        savedCount,
        skippedCount,
        errorCount,
        totalFetched: allCalls.length,
        pagesFetched: page,
        syncLogId,
        duration_ms: syncDuration,
        errors: errors.length > 0 ? errors : undefined,
        skippedCalls: skippedCalls.length > 0 ? skippedCalls : undefined,
        skipReasons: syncLogger.skipReasons,
        logs: syncLogger.logs,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    const syncDuration = Date.now() - syncStartTime;
    console.error("Error in sync-highlevel-calls:", error);

    // Try to log the error if we have userId from the request
    try {
      const body = await req.clone().json();
      if (body?.userId) {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );

        // Update sync log with failure status
        if (syncLogId) {
          await supabase
            .from('call_sync_logs')
            .update({
              sync_completed_at: new Date().toISOString(),
              sync_status: 'failed',
              error_details: {
                message: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined,
              },
              duration_ms: syncDuration,
            })
            .eq('id', syncLogId);
        }

        await supabase.rpc('log_integration_error', {
          p_user_id: body.userId,
          p_error_type: 'call_sync_failed',
          p_error_source: 'sync_function',
          p_error_message: error instanceof Error ? error.message : 'Unknown error during sync',
          p_error_code: 'SYNC_FAILED',
          p_request_data: {},
          p_response_data: {},
          p_stack_trace: error instanceof Error ? error.stack : undefined,
        });
      }
    } catch (logError) {
      console.error("Failed to log error:", logError);
    }

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
        details: error,
        syncLogId,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});