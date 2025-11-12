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

    if (!clientId || !redirectUri || responseType !== "code") {
      return new Response(
        JSON.stringify({ error: "invalid_request" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      const loginUrl = `${supabaseUrl}/auth/v1/authorize?redirect_to=${encodeURIComponent(req.url)}`;
      return new Response(null, {
        status: 302,
        headers: {
          ...corsHeaders,
          "Location": loginUrl,
        },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const code = crypto.randomUUID();
    const { error: insertError } = await supabase
      .from("oauth_authorization_codes")
      .insert({
        code,
        user_id: user.id,
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: scope || "",
        state: state || "",
      });

    if (insertError) {
      console.error("Error inserting auth code:", insertError);
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
      JSON.stringify({ error: "server_error", message: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
