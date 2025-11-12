import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const contentType = req.headers.get("content-type");
    let body: any;

    if (contentType?.includes("application/json")) {
      body = await req.json();
    } else {
      const formData = await req.formData();
      body = Object.fromEntries(formData);
    }

    const { refresh_token } = body;

    if (!refresh_token) {
      return new Response(
        JSON.stringify({ error: "invalid_request" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: tokenData, error: fetchError } = await supabase
      .from("api_keys")
      .select("*")
      .eq("refresh_token", refresh_token)
      .maybeSingle();

    if (fetchError || !tokenData) {
      return new Response(
        JSON.stringify({ error: "invalid_grant" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const newAccessToken = crypto.randomUUID();
    const newRefreshToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();

    const { error: updateError } = await supabase
      .from("api_keys")
      .update({
        access_token: newAccessToken,
        refresh_token: newRefreshToken,
        token_expires_at: expiresAt,
      })
      .eq("id", tokenData.id);

    if (updateError) {
      console.error("Error updating tokens:", updateError);
      return new Response(
        JSON.stringify({ error: "server_error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        access_token: newAccessToken,
        token_type: "Bearer",
        expires_in: 3600,
        refresh_token: newRefreshToken,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("OAuth refresh error:", error);
    return new Response(
      JSON.stringify({ error: "server_error", message: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});