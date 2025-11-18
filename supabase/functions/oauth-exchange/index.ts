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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { code, state } = await req.json();

    if (!code) {
      return new Response(
        JSON.stringify({ error: "code is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    let userId: string | null = null;

    if (state) {
      const { data: stateRecord, error: stateError } = await supabase
        .from("oauth_states")
        .select("user_id, admin_id, expires_at")
        .eq("state", state)
        .maybeSingle();

      if (stateError || !stateRecord) {
        console.error("Invalid state during exchange:", stateError);
        return new Response(
          JSON.stringify({ error: "invalid_state" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (stateRecord.expires_at && new Date(stateRecord.expires_at) < new Date()) {
        return new Response(
          JSON.stringify({ error: "state_expired" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      userId = stateRecord.user_id;
    } else {
      // Fallback to code lookup if state not provided
      const { data: authCode, error: codeError } = await supabase
        .from("oauth_authorization_codes")
        .select("user_id")
        .eq("code", code)
        .maybeSingle();

      if (codeError || !authCode) {
        console.error("Invalid auth code and no state provided:", codeError);
        return new Response(
          JSON.stringify({ error: "invalid_code" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      userId = authCode.user_id;
    }

    if (!userId) {
      console.error("Exchange failed: userId unresolved", { code, state });
      return new Response(
        JSON.stringify({ error: "invalid_request", details: "could not resolve user from state or code" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const clientId = Deno.env.get("HIGHLEVEL_CLIENT_ID");
    const clientSecret = Deno.env.get("HIGHLEVEL_CLIENT_SECRET");
    const tokenUrl = Deno.env.get("HIGHLEVEL_TOKEN_URL") || "https://services.leadconnectorhq.com/oauth/token";
    const redirectUri = Deno.env.get("HIGHLEVEL_REDIRECT_URI") || "https://voiceaidash.app/oauth/callback";

    if (!clientId || !clientSecret) {
      console.error("Missing HighLevel OAuth credentials");
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const exchangeResponse = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        user_type: "Company",
      }).toString(),
    });

    if (!exchangeResponse.ok) {
      const errorText = await exchangeResponse.text();
      console.error("HighLevel token exchange failed:", errorText);
      return new Response(
        JSON.stringify({ error: "Failed to exchange code", details: errorText }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tokens = await exchangeResponse.json();
    const expiresAt = new Date(Date.now() + (tokens.expires_in * 1000)).toISOString();

    // Replace existing connection for this user
    await supabase
      .from("api_keys")
      .delete()
      .eq("user_id", userId)
      .eq("service", "highlevel");

    const { error: insertError } = await supabase
      .from("api_keys")
      .insert({
        name: "HighLevel OAuth Connection",
        service: "highlevel",
        user_id: userId,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expires_at: expiresAt,
        location_id: tokens.locationId || null,
        company_id: tokens.companyId || null,
        is_active: true,
      });

    if (insertError) {
      console.error("Failed to save tokens:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to store tokens" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        expires_at: expiresAt,
        location_id: tokens.locationId || null,
        company_id: tokens.companyId || null,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("OAuth exchange error:", error);
    return new Response(
      JSON.stringify({ error: "server_error", message: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
