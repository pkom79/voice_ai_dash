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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Missing or invalid authorization" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { userId } = await req.json();

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "userId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const bearer = authHeader.replace("Bearer ", "");

    let isServiceRoleCall = false;
    let requesterId: string | null = null;
    let requesterRole: string | null = null;

    if (bearer === supabaseKey) {
      isServiceRoleCall = true;
    } else {
      const { data: { user }, error: userError } = await supabase.auth.getUser(bearer);

      if (userError || !user) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      requesterId = user.id;

      const { data: requester, error: roleError } = await supabase
        .from("users")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (roleError) {
        console.error("Failed to fetch requester role:", roleError);
        return new Response(
          JSON.stringify({ error: "Failed to verify permissions" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      requesterRole = requester?.role || null;

      const isAdmin = requesterRole === "admin";
      if (userId !== requesterId && !isAdmin) {
        return new Response(
          JSON.stringify({ error: "Forbidden" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Get user's OAuth token data
    const { data: tokenData, error: fetchError } = await supabase
      .from("api_keys")
      .select("*")
      .eq("user_id", userId)
      .eq("service", "highlevel")
      .eq("is_active", true)
      .maybeSingle();

    if (fetchError || !tokenData || !tokenData.refresh_token) {
      return new Response(
        JSON.stringify({ error: "No valid OAuth connection found" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get HighLevel OAuth credentials from environment
    const clientId = Deno.env.get("HIGHLEVEL_CLIENT_ID");
    const clientSecret = Deno.env.get("HIGHLEVEL_CLIENT_SECRET");
    const tokenUrl = Deno.env.get("HIGHLEVEL_TOKEN_URL") || "https://services.leadconnectorhq.com/oauth/token";

    if (!clientId || !clientSecret) {
      console.error("Missing HighLevel OAuth credentials");
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Refresh the token with HighLevel
    console.log("Refreshing HighLevel OAuth token for user:", userId);
    console.log("Token data - location_id:", tokenData.location_id, "token_expires_at:", tokenData.token_expires_at);
    console.log("Refresh token (first 20 chars):", tokenData.refresh_token?.substring(0, 20) + "...");
    console.log("Is service role call:", isServiceRoleCall);

    // Get redirect URI from environment
    const redirectUri = Deno.env.get("HIGHLEVEL_REDIRECT_URI") || "https://voiceaidash.app/oauth/callback";

    // Determine user_type based on stored token data
    // If we have a location_id, it's a Location level token. Otherwise assume Company.
    const userType = tokenData.location_id ? "Location" : "Company";
    console.log("Using user_type:", userType, "redirect_uri:", redirectUri);

    const refreshResponse = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: tokenData.refresh_token,
        user_type: userType,
        redirect_uri: redirectUri,
      }).toString(),
    });

    console.log("HighLevel response status:", refreshResponse.status);

    if (!refreshResponse.ok) {
      const errorText = await refreshResponse.text();
      console.error("HighLevel token refresh failed:", errorText);
      console.error("Full request params - client_id:", clientId?.substring(0, 10) + "...", "user_type:", userType);
      return new Response(
        JSON.stringify({ error: "Failed to refresh token with HighLevel", details: errorText }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const refreshData = await refreshResponse.json();
    console.log("Token refreshed successfully");

    // Calculate expiration time
    const expiresAt = new Date(Date.now() + (refreshData.expires_in * 1000)).toISOString();

    // Update tokens in database
    const { error: updateError } = await supabase
      .from("api_keys")
      .update({
        access_token: refreshData.access_token,
        refresh_token: refreshData.refresh_token || tokenData.refresh_token, // Keep old if new one not provided
        token_expires_at: expiresAt,
      })
      .eq("id", tokenData.id);

    if (updateError) {
      console.error("Error updating tokens:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to update tokens in database" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        access_token: refreshData.access_token,
        token_type: refreshData.token_type || "Bearer",
        expires_in: refreshData.expires_in,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("OAuth refresh error:", error);
    return new Response(
      JSON.stringify({ error: "server_error", message: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
