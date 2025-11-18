import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
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
    const url = new URL(req.url);
    const clientId = url.searchParams.get("client_id");
    const scope = url.searchParams.get("scope");
    const state = url.searchParams.get("state");
    const redirectUri = url.searchParams.get("redirect_uri");
    const responseType = url.searchParams.get("response_type");
    const tokenFromQuery = url.searchParams.get("access_token");

    console.log("[oauth-authorize] request", {
      clientId,
      redirectUri,
      responseType,
      hasState: Boolean(state),
      hasTokenQuery: Boolean(tokenFromQuery),
      origin: req.headers.get("origin"),
      host: req.headers.get("host"),
      path: url.pathname,
    });

    if (!clientId || !redirectUri || responseType !== "code") {
      return new Response(
        JSON.stringify({ error: "invalid_request", details: { clientId, redirectUri, responseType } }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Validate state and fetch the user who initiated the flow
    const { data: stateRecord, error: stateError } = await supabase
      .from("oauth_states")
      .select("user_id, admin_id, expires_at")
      .eq("state", state)
      .maybeSingle();

    if (stateError || !stateRecord) {
      console.error("[oauth-authorize] State lookup failed", stateError);
      return new Response(
        JSON.stringify({ error: "invalid_state", details: stateError?.message || "not found" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (stateRecord.expires_at && new Date(stateRecord.expires_at) < new Date()) {
      console.warn("[oauth-authorize] State expired", { state, expires_at: stateRecord.expires_at });
      return new Response(
        JSON.stringify({ error: "state_expired" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const code = crypto.randomUUID();
    const { error: insertError } = await supabase
      .from("oauth_authorization_codes")
      .insert({
        code,
        user_id: stateRecord.user_id,
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: scope || "",
        state: state || "",
      });

    if (insertError) {
      console.error("[oauth-authorize] Error inserting auth code:", insertError);
      return new Response(
        JSON.stringify({ error: "server_error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const redirectUrl = new URL(redirectUri);
    redirectUrl.searchParams.set("code", code);
    if (state) redirectUrl.searchParams.set("state", state);

    return new Response(null, {
      status: 302,
      headers: {
        ...corsHeaders,
        "Location": redirectUrl.toString(),
      },
    });
  } catch (error) {
    console.error("OAuth authorize error:", error);
    return new Response(
      JSON.stringify({ error: "server_error", message: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
