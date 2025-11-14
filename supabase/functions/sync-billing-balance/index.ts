import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface SyncBillingRequest {
  userId: string;
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

    const { userId }: SyncBillingRequest = await req.json();

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "userId is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`Syncing billing balance for user: ${userId}`);

    // Get all calls for this user and sum the costs (exclude INCLUDED calls)
    const { data: calls, error: callsError } = await supabase
      .from("calls")
      .select("cost, display_cost")
      .eq("user_id", userId);

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

    // Calculate total cost in cents (exclude INCLUDED calls)
    const totalCostCents = (calls || [])
      .filter((call) => call.display_cost !== 'INCLUDED')
      .reduce((sum, call) => sum + Math.round((call.cost || 0) * 100), 0);

    console.log(`Total cost calculated: ${totalCostCents} cents ($${(totalCostCents / 100).toFixed(2)})`);

    // Update billing account's month_spent_cents
    const { error: updateError } = await supabase
      .from("billing_accounts")
      .update({
        month_spent_cents: totalCostCents,
      })
      .eq("user_id", userId);

    if (updateError) {
      console.error("Error updating billing account:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to update billing account", details: updateError }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`Successfully updated month_spent_cents to ${totalCostCents} cents`);

    return new Response(
      JSON.stringify({
        success: true,
        totalCostCents,
        totalCostDollars: (totalCostCents / 100).toFixed(2),
        callsCount: calls?.length || 0,
        message: `Billing balance updated successfully`,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in sync-billing-balance:", error);
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
