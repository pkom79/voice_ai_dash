import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Auth Check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    if (authError || !user) throw new Error("Invalid token");

    // Admin Check
    const { data: userData, error: userError } = await supabaseAdmin
      .from("users")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (userError || userData?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 403, headers: corsHeaders });
    }

    const { callId } = await req.json();
    if (!callId) throw new Error("Missing callId");

    // Fetch Call to log details before deletion
    const { data: call, error: fetchError } = await supabaseAdmin
      .from("calls")
      .select("*")
      .eq("id", callId)
      .single();

    if (fetchError || !call) throw new Error("Call not found");

    // Record in deleted_calls to prevent re-sync
    if (call.highlevel_call_id) {
      await supabaseAdmin.from("deleted_calls").insert({
        user_id: call.user_id,
        highlevel_call_id: call.highlevel_call_id,
      });
    }

    // Delete Call
    const { error: deleteError } = await supabaseAdmin
      .from("calls")
      .delete()
      .eq("id", callId);

    if (deleteError) throw deleteError;

    // Log Audit
    await supabaseAdmin.from("audit_logs").insert({
      admin_user_id: user.id,
      action: "delete_call",
      target_user_id: call.user_id,
      details: { 
        call_id: callId, 
        cost: call.cost, 
        duration: call.duration_seconds,
        contact: call.contact_name,
        started_at: call.call_started_at
      }
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error deleting call:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
