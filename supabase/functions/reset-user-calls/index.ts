import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Create Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase environment variables");
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    // Verify Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing Authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !user) {
      throw new Error("Invalid token");
    }

    // Check if user is admin
    const { data: userData, error: userError } = await supabaseAdmin
      .from("users")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (userError || userData?.role !== "admin") {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const { userId } = await req.json();

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "userId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Admin ${user.id} resetting call data for user: ${userId}`);

    // Get all call IDs for this user before deletion
    const { data: callsToDelete, error: fetchError } = await supabaseAdmin
      .from("calls")
      .select("id")
      .eq("user_id", userId);

    if (fetchError) {
      console.error("Error fetching calls to delete:", fetchError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch calls", details: fetchError }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const callIds = callsToDelete?.map(c => c.id) || [];
    console.log(`Found ${callIds.length} calls to delete`);

    // Delete usage logs associated with these calls
    if (callIds.length > 0) {
      const { error: usageLogDeleteError } = await supabaseAdmin
        .from("usage_logs")
        .delete()
        .in("call_id", callIds);

      if (usageLogDeleteError) {
        console.error("Error deleting usage logs:", usageLogDeleteError);
        return new Response(
          JSON.stringify({ error: "Failed to delete usage logs", details: usageLogDeleteError }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      console.log(`Deleted usage logs for ${callIds.length} calls`);
    }

    // Delete all calls for this user
    const { error: callsDeleteError } = await supabaseAdmin
      .from("calls")
      .delete()
      .eq("user_id", userId);

    if (callsDeleteError) {
      console.error("Error deleting calls:", callsDeleteError);
      return new Response(
        JSON.stringify({ error: "Failed to delete calls", details: callsDeleteError }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`Deleted all calls for user ${userId}`);

    // Recalculate month_spent_cents from remaining usage logs
    const { data: remainingUsage, error: usageError } = await supabaseAdmin
      .from("usage_logs")
      .select("cost_cents")
      .eq("user_id", userId);

    if (usageError) {
      console.error("Error fetching remaining usage:", usageError);
      return new Response(
        JSON.stringify({ error: "Failed to recalculate billing", details: usageError }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const totalCostCents = remainingUsage?.reduce((sum, log) => sum + (log.cost_cents || 0), 0) || 0;

    console.log(`Recalculated month_spent_cents: ${totalCostCents} cents`);

    // Update billing account with reset timestamp and recalculated cost
    const { error: billingUpdateError } = await supabaseAdmin
      .from("billing_accounts")
      .update({
        calls_reset_at: new Date().toISOString(),
        month_spent_cents: totalCostCents,
      })
      .eq("user_id", userId);

    if (billingUpdateError) {
      console.error("Error updating billing account:", billingUpdateError);
      return new Response(
        JSON.stringify({ error: "Failed to update billing account", details: billingUpdateError }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`Successfully reset call data for user ${userId}`);

    return new Response(
      JSON.stringify({
        success: true,
        deletedCallsCount: callIds.length,
        resetTimestamp: new Date().toISOString(),
        message: "All call data has been permanently deleted. Future syncs will only fetch calls after this reset.",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in reset-user-calls:", error);
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
