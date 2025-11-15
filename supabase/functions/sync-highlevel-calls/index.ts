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

    const { userId, startDate, endDate }: SyncCallsRequest = await req.json();

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

    // Build query params for Voice AI dashboard call logs endpoint
    const params = new URLSearchParams();
    if (oauthData.location_id) {
      params.append("locationId", oauthData.location_id);
    }

    // Apply startDate filter based on calls_reset_at or provided startDate
    let effectiveStartDate = startDate;
    if (billingAccount?.calls_reset_at) {
      const resetDate = new Date(billingAccount.calls_reset_at).toISOString();
      // Use the most recent date between reset date and provided startDate
      if (!startDate || new Date(resetDate) > new Date(startDate)) {
        effectiveStartDate = resetDate;
        console.log(`Using calls_reset_at as startDate filter: ${resetDate}`);
      }
    }

    if (effectiveStartDate) params.append("startDate", effectiveStartDate);
    if (endDate) params.append("endDate", endDate);

    // Fetch Voice AI call logs from HighLevel (requires voice-ai-dashboard.readonly scope)
    const highLevelUrl = `https://services.leadconnectorhq.com/voice-ai/dashboard/call-logs${params.toString() ? `?${params.toString()}` : ""}`;

    console.log("Fetching Voice AI call logs from HighLevel:", highLevelUrl);

    const callsResponse = await fetch(highLevelUrl, {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Version": "2021-07-28",
      },
    });

    if (!callsResponse.ok) {
      const errorText = await callsResponse.text();
      console.error("HighLevel API error:", callsResponse.status, errorText);
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

    const callsData = await callsResponse.json();
    console.log("Fetched calls:", callsData);

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
    let totalCostAdded = 0; // Track total cost for billing update

    if (callsData.callLogs && Array.isArray(callsData.callLogs)) {
      console.log(`Processing ${callsData.callLogs.length} calls...`);
      console.log('Full API response structure:', JSON.stringify(callsData, null, 2));
      if (callsData.callLogs[0]) {
        console.log('First call detailed sample:', JSON.stringify(callsData.callLogs[0], null, 2));
      }

      for (const call of callsData.callLogs) {
        try {
          // Skip calls from agents not assigned to this user
          if (call.agentId && !assignedAgentHighLevelIds.has(call.agentId)) {
            console.log(`Skipping call ${call.id} - agent ${call.agentId} not assigned to user ${userId}`);
            skippedCount++;
            continue;
          }

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
            } else {
              // Agent not in database - skip this call since agents must be explicitly assigned
              console.log(`Skipping call ${call.id} - agent ${call.agentId} not found in database`);
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
          // According to HighLevel, calls without a FROM number are test calls
          const fromNumber = call.fromNumber || call.from || '';
          const isTestCall = !fromNumber || fromNumber.trim() === '' || call.isTestCall === true;

          // Map HighLevel call data to our schema
          const callRecord = {
            highlevel_call_id: call.id,
            user_id: userId,
            agent_id: agentDbId,
            direction: direction,
            contact_name: contactName,
            from_number: fromNumber,
            to_number: call.toNumber || call.to || '',
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
            console.error('Error upserting call:', call.id, upsertError);
            errors.push({ callId: call.id, error: upsertError.message, details: upsertError });
            errorCount++;
          } else {
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
          console.error('Error processing call:', call.id, callError);
          errors.push({ callId: call.id, error: callError instanceof Error ? callError.message : 'Unknown error' });
          errorCount++;
        }
      }
    }

    console.log(`Sync complete: ${savedCount} calls saved, ${skippedCount} skipped (unassigned agents), ${errorCount} errors`);
    if (errors.length > 0) {
      console.error('Errors encountered:', JSON.stringify(errors, null, 2));
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
        totalFetched: callsData.callLogs?.length || 0,
        errors: errors.length > 0 ? errors : undefined,
        calls: callsData
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in sync-highlevel-calls:", error);

    // Try to log the error if we have userId from the request
    try {
      const body = await req.clone().json();
      if (body?.userId) {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );

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
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
