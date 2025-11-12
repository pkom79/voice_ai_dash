import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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
    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Create Supabase client with the user's JWT
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    // Verify the JWT and get user
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication token' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const url = new URL(req.url);
    const messageId = url.searchParams.get('messageId');
    const locationId = url.searchParams.get('locationId');
    const userId = url.searchParams.get('userId');

    if (!messageId || !locationId || !userId) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Verify user has access to this recording
    // Admin can access any user's recordings, regular users can only access their own
    const { data: profile } = await supabaseClient
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin' && user.id !== userId) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized access to this recording' }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Get the HighLevel access token for this user
    const tokenResponse = await fetch(`${supabaseUrl}/rest/v1/api_keys?user_id=eq.${userId}&service=eq.highlevel&is_active=eq.true&select=access_token`, {
      headers: {
        'apikey': supabaseServiceKey!,
        'Authorization': `Bearer ${supabaseServiceKey}`,
      },
    });

    if (!tokenResponse.ok) {
      throw new Error('Failed to fetch access token');
    }

    const tokens = await tokenResponse.json();
    if (!tokens || tokens.length === 0 || !tokens[0].access_token) {
      return new Response(
        JSON.stringify({ error: 'No valid access token found for user' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const accessToken = tokens[0].access_token;

    // Fetch the recording from HighLevel
    const recordingUrl = `https://services.leadconnectorhq.com/conversations/messages/${messageId}/locations/${locationId}/recording`;

    const recordingResponse = await fetch(recordingUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Version': '2021-07-28',
      },
    });

    if (!recordingResponse.ok) {
      const errorText = await recordingResponse.text();
      console.error('Recording fetch error:', recordingResponse.status, errorText);
      return new Response(
        JSON.stringify({
          error: 'Recording not available',
          details: `Status: ${recordingResponse.status}`,
          message: 'The recording may still be processing or is not available for this call.'
        }),
        {
          status: recordingResponse.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Stream the audio response
    const audioBlob = await recordingResponse.blob();

    return new Response(audioBlob, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'audio/wav',
        'Content-Disposition': 'inline',
      },
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});