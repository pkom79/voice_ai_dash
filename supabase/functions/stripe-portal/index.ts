import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

async function getSecret(key: string): Promise<string | null> {
  const envValue = Deno.env.get(key);
  if (envValue) {
    return envValue;
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data, error } = await supabase
    .from('app_secrets')
    .select('value')
    .eq('key', key)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data.value;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const STRIPE_SECRET_KEY = await getSecret('STRIPE_SECRET_KEY');

    if (!STRIPE_SECRET_KEY) {
      throw new Error('Stripe secret key not configured');
    }

    // Validate user via Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing Authorization header');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error('Invalid or expired user token');
    }

    const { returnUrl } = await req.json();

    if (!returnUrl) {
      return new Response(
        JSON.stringify({ error: 'Missing returnUrl parameter' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: billing, error: billingError } = await supabaseAdmin
      .from('billing_accounts')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (billingError || !billing?.stripe_customer_id) {
      return new Response(
        JSON.stringify({ error: 'No Stripe customer found' }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const params = new URLSearchParams({
      customer: billing.stripe_customer_id,
      return_url: returnUrl,
    });

    const response = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Stripe API error:', errorText);
      console.error('Stripe API status:', response.status);

      // Check for portal configuration error
      if (errorText.includes('No configuration provided')) {
        throw new Error('Stripe Customer Portal is not configured. Please contact support.');
      }

      throw new Error(`Stripe API error (${response.status}): ${errorText}`);
    }

    const session = await response.json();

    return new Response(
      JSON.stringify({ url: session.url }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Portal error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});