import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface RecalculateCostsRequest {
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
  if (direction === 'inbound' && billingAccount.inbound_plan === 'inbound_unlimited') {
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

  if (!rateCents) {
    rateCents = 100;
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

    const { userId, startDate, endDate }: RecalculateCostsRequest = await req.json();

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "userId is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`Recalculating call costs for user: ${userId}`);

    // Get user's billing account information
    const { data: billingAccount, error: billingError } = await supabase
      .from("billing_accounts")
      .select("inbound_rate_cents, outbound_rate_cents, inbound_plan")
      .eq("user_id", userId)
      .maybeSingle();

    if (billingError) {
      console.error("Billing account error:", billingError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch billing account", details: billingError }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!billingAccount) {
      return new Response(
        JSON.stringify({ error: "No billing account found for user" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log("User billing account:", billingAccount);

    // Build query to fetch calls
    let callsQuery = supabase
      .from("calls")
      .select("id, duration_seconds, direction, cost, display_cost, call_started_at")
      .eq("user_id", userId);

    if (startDate) {
      callsQuery = callsQuery.gte("call_started_at", startDate);
    }
    if (endDate) {
      callsQuery = callsQuery.lte("call_started_at", endDate);
    }

    const { data: calls, error: callsError } = await callsQuery;

    if (callsError) {
      console.error("Error fetching calls:", callsError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch calls", details: callsError }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`Found ${calls?.length || 0} calls to recalculate`);

    let updatedCount = 0;
    let errorCount = 0;
    let totalNewCostCents = 0; // Track total cost after recalculation (in cents)
    const errors: any[] = [];

    // Delete existing usage_logs for these calls to regenerate them
    if (calls && calls.length > 0) {
      const callIds = calls.map(c => c.id);
      const { error: deleteUsageError } = await supabase
        .from("usage_logs")
        .delete()
        .in("call_id", callIds);

      if (deleteUsageError) {
        console.error("Error deleting old usage logs:", deleteUsageError);
      } else {
        console.log(`Deleted old usage logs for ${callIds.length} calls`);
      }
    }

    // Recalculate cost for each call
    for (const call of calls || []) {
      try {
        const { cost, displayCost } = calculateCallCost(
          call.duration_seconds || 0,
          call.direction,
          billingAccount
        );

        console.log(
          `Call ${call.id}: old cost=$${call.cost}, new cost=$${cost}, display=${displayCost}`
        );

        // Update call record
        const { error: updateError } = await supabase
          .from("calls")
          .update({
            cost: cost,
            display_cost: displayCost,
          })
          .eq("id", call.id);

        if (updateError) {
          console.error(`Error updating call ${call.id}:`, updateError);
          errors.push({ callId: call.id, error: updateError.message });
          errorCount++;
          continue;
        }

        // Add to total cost (exclude INCLUDED calls)
        const newCostCents = Math.round(cost * 100);
        if (displayCost !== 'INCLUDED') {
          totalNewCostCents += newCostCents;
        }

        // Create new usage log entry if there's a cost
        if (cost > 0 && displayCost !== 'INCLUDED') {
          // Delete existing usage log for this call to avoid duplicates/stale data
          await supabase
            .from("usage_logs")
            .delete()
            .eq("call_id", call.id);

          const { error: usageLogError } = await supabase
            .from("usage_logs")
            .insert({
              user_id: userId,
              call_id: call.id,
              cost_cents: newCostCents,
              usage_type: call.direction,
              created_at: call.call_started_at,
            });

          if (usageLogError) {
            console.error(`Error creating usage log for call ${call.id}:`, usageLogError);
          }
        }

        updatedCount++;
      } catch (error) {
        console.error(`Error processing call ${call.id}:`, error);
        errors.push({
          callId: call.id,
          error: error instanceof Error ? error.message : "Unknown error",
        });
        errorCount++;
      }
    }

    // Recalculate month_spent_cents for the CURRENT billing cycle (1st of current month to now)
    // This ensures that even if we recalculate past calls, the dashboard shows the correct current month spend.
    const now = new Date();
    const currentMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const { data: currentMonthUsage, error: usageError } = await supabase
      .from('usage_logs')
      .select('cost_cents')
      .eq('user_id', userId)
      .gte('created_at', currentMonthStart.toISOString());

    let currentMonthSpentCents = 0;
    if (!usageError && currentMonthUsage) {
      currentMonthSpentCents = currentMonthUsage.reduce((sum, log) => sum + (log.cost_cents || 0), 0);
    }

    console.log(`Updating billing account: setting month_spent_cents to ${currentMonthSpentCents} cents (Current Cycle: ${currentMonthStart.toISOString()} - Now)`);
    const { error: billingUpdateError } = await supabase
      .from("billing_accounts")
      .update({
        month_spent_cents: currentMonthSpentCents,
      })
      .eq("user_id", userId);

    if (billingUpdateError) {
      console.error("Error updating billing account:", billingUpdateError);
    } else {
      console.log("Successfully updated month_spent_cents");
    }

    console.log(
      `Recalculation complete: ${updatedCount} calls updated, ${errorCount} errors`
    );

    return new Response(
      JSON.stringify({
        success: true,
        updatedCount,
        errorCount,
        totalCalls: calls?.length || 0,
        totalCostDollars: (totalNewCostCents / 100).toFixed(2),
        totalCostCents: totalNewCostCents,
        errors: errors.length > 0 ? errors : undefined,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in recalculate-call-costs:", error);
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
