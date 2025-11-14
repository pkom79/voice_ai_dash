import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface Agent {
  id: string;
  agentName: string;
  name?: string;
  description?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get Authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify the user making the request
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify user is admin
    const { data: userRecord } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();

    if (userRecord?.role !== "admin") {
      return new Response(
        JSON.stringify({ error: "Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get userId from request body
    const { userId } = await req.json();

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "userId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user's active HighLevel connection
    const { data: apiKey, error: apiKeyError } = await supabase
      .from("api_keys")
      .select("access_token, refresh_token, token_expires_at, location_id")
      .eq("user_id", userId)
      .eq("is_active", true)
      .single();

    if (apiKeyError || !apiKey) {
      return new Response(
        JSON.stringify({ error: "No active HighLevel connection found for this user" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let accessToken = apiKey.access_token;

    // Check if token needs refresh
    const expiresAt = new Date(apiKey.token_expires_at);
    const now = new Date();
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

    if (expiresAt <= fiveMinutesFromNow) {
      // Need to refresh token
      const tokenResponse = await fetch("https://services.leadconnectorhq.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: Deno.env.get("HIGHLEVEL_CLIENT_ID")!,
          client_secret: Deno.env.get("HIGHLEVEL_CLIENT_SECRET")!,
          grant_type: "refresh_token",
          refresh_token: apiKey.refresh_token,
        }),
      });

      if (!tokenResponse.ok) {
        return new Response(
          JSON.stringify({ error: "Failed to refresh access token" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const tokenData = await tokenResponse.json();
      accessToken = tokenData.access_token;

      // Update token in database
      await supabase
        .from("api_keys")
        .update({
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token || apiKey.refresh_token,
          token_expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
        })
        .eq("user_id", userId);
    }

    // Fetch agents from HighLevel
    const agentsResponse = await fetch(
      `https://services.leadconnectorhq.com/voice-ai/agents?locationId=${apiKey.location_id}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Version: "2021-07-28",
        },
      }
    );

    if (!agentsResponse.ok) {
      const errorText = await agentsResponse.text();
      console.error("HighLevel API error:", {
        status: agentsResponse.status,
        statusText: agentsResponse.statusText,
        body: errorText,
        url: `https://services.leadconnectorhq.com/voice-ai/agents?locationId=${apiKey.location_id}`
      });
      return new Response(
        JSON.stringify({
          error: "Failed to fetch agents from HighLevel",
          details: `Status: ${agentsResponse.status}, ${errorText.substring(0, 200)}`
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const agentsData = await agentsResponse.json();
    console.log('HighLevel API full response:', JSON.stringify(agentsData));
    console.log('Response keys:', Object.keys(agentsData));

    // Try multiple possible field names
    const agents: Agent[] =
      agentsData.voiceAiAgents ||
      agentsData.agents ||
      agentsData.data ||
      (Array.isArray(agentsData) ? agentsData : []);

    console.log(`Found ${agents.length} agents in response from field check`);

    // Filter out agents without names (check both agentName and name fields)
    const validAgents = agents.filter(agent => {
      const name = agent.agentName || agent.name;
      return name && name.trim() !== "";
    });
    console.log(`After filtering: ${validAgents.length} agents with valid names`);

    if (validAgents.length === 0) {
      console.log('Returning empty agents array with message');
      return new Response(
        JSON.stringify({
          agents: [],
          message: "No agents with valid names found in HighLevel location",
          debug: {
            totalAgents: agents.length,
            locationId: apiKey.location_id,
            rawResponse: JSON.stringify(agentsData).substring(0, 500),
            responseKeys: Object.keys(agentsData),
            fullResponse: agentsData
          }
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Return agents with location_id included
    return new Response(
      JSON.stringify({
        agents: validAgents.map(agent => ({
          id: agent.id,
          name: agent.agentName || agent.name,
          description: agent.description || "",
          location_id: apiKey.location_id
        }))
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in fetch-available-agents:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});