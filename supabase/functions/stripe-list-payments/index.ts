import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

function getEnvValue(key: string): string | undefined {
  return Deno.env.get(key);
}

async function getSecret(key: string, supabase: ReturnType<typeof createClient>): Promise<string | null> {
  const envValue = getEnvValue(key);
  if (envValue) {
    return envValue;
  }

  const { data, error } = await supabase
    .from('app_secrets')
    .select('value')
    .eq('key', key)
    .maybeSingle();

  if (error || !data) {
    console.error(`Missing secret ${key}`, error);
    return null;
  }

  return data.value;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { userId, limit = 10 } = await req.json();

    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'userId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: billing, error: billingError } = await supabase
      .from('billing_accounts')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (billingError) {
      throw billingError;
    }

    if (!billing?.stripe_customer_id) {
      return new Response(JSON.stringify({ payments: [] }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const STRIPE_SECRET_KEY = await getSecret('STRIPE_SECRET_KEY', supabase);

    if (!STRIPE_SECRET_KEY) {
      throw new Error('Stripe secret key not configured');
    }

    const url = new URL('https://api.stripe.com/v1/payment_intents');
    url.searchParams.set('customer', billing.stripe_customer_id);
    url.searchParams.set('limit', Math.min(Math.max(Number(limit) || 10, 1), 100).toString());

    const stripeResponse = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
      },
    });

    if (!stripeResponse.ok) {
      const errorText = await stripeResponse.text();
      console.error('Stripe payment list error:', errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to retrieve payments from Stripe' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const payload = await stripeResponse.json();
    const payments = (payload.data || []).map((pi: any) => ({
      id: pi.id,
      amount: pi.amount,
      amount_received: pi.amount_received,
      currency: pi.currency,
      status: pi.status,
      description: pi.description,
      created: pi.created,
      metadata: pi.metadata,
      receipt_url: pi.charges?.data?.[0]?.receipt_url || null,
    }));

    return new Response(JSON.stringify({ payments }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Stripe payments error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
