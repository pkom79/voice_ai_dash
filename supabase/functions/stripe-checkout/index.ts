import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

async function getSecret(key: string): Promise<string | null> {
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
    const STRIPE_UNLIMITED_PRICE_ID = await getSecret('STRIPE_UNLIMITED_PRICE_ID');

    if (!STRIPE_SECRET_KEY) {
      throw new Error('Stripe secret key not configured');
    }

    const { userId, type, amountCents, walletCents, inboundPlan, outboundPlan, walletTopupCents, subscriptionRequired } = await req.json();

    if (!userId || !type) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const baseUrl = 'https://api.stripe.com/v1';

    const origin = req.headers.get('origin') || req.headers.get('referer')?.split('/').slice(0, 3).join('/') || Deno.env.get('SUPABASE_URL')?.replace('/functions/v1', '');

    const successUrl = `${origin}/billing?success=true`;
    const cancelUrl = `${origin}/billing?canceled=true`;

    let checkoutUrl: string;

    if (type === 'wallet_topup') {
      if (!amountCents || amountCents < 5000) {
        return new Response(
          JSON.stringify({ error: 'Minimum amount is $50' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      const params = new URLSearchParams({
        'payment_method_types[]': 'card',
        'line_items[0][price_data][currency]': 'usd',
        'line_items[0][price_data][product_data][name]': 'Wallet Top-Up',
        'line_items[0][price_data][unit_amount]': amountCents.toString(),
        'line_items[0][quantity]': '1',
        'mode': 'payment',
        'success_url': successUrl,
        'cancel_url': cancelUrl,
      });

      params.append('metadata[user_id]', userId);
      params.append('metadata[type]', 'wallet_topup');
      params.append('metadata[amount_cents]', amountCents.toString());

      const response = await fetch(`${baseUrl}/checkout/sessions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('Stripe API error:', error);
        throw new Error('Failed to create checkout session');
      }

      const session = await response.json();
      checkoutUrl = session.url;

    } else if (type === 'unlimited_upgrade') {
      if (!STRIPE_UNLIMITED_PRICE_ID) {
        throw new Error('Unlimited plan not configured');
      }

      const params = new URLSearchParams({
        'payment_method_types[]': 'card',
        'line_items[0][price]': STRIPE_UNLIMITED_PRICE_ID,
        'line_items[0][quantity]': '1',
        'mode': 'subscription',
        'success_url': successUrl,
        'cancel_url': cancelUrl,
      });

      params.append('metadata[user_id]', userId);
      params.append('metadata[type]', 'unlimited_upgrade');
      params.append('metadata[wallet_cents]', (walletCents || 0).toString());
      params.append('subscription_data[metadata][user_id]', userId);
      params.append('subscription_data[metadata][plan]', 'unlimited');

      const response = await fetch(`${baseUrl}/checkout/sessions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('Stripe API error:', error);
        throw new Error('Failed to create subscription session');
      }

      const session = await response.json();
      checkoutUrl = session.url;

    } else if (type === 'first_login_billing') {
      // Handle dual-plan first login billing
      const needsWallet = walletTopupCents && walletTopupCents > 0;
      const needsSubscription = subscriptionRequired === true;

      if (!needsWallet && !needsSubscription) {
        return new Response(
          JSON.stringify({ error: 'No payment required' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      // If both wallet and subscription are needed, create a combined payment
      if (needsWallet && needsSubscription) {
        if (!STRIPE_UNLIMITED_PRICE_ID) {
          throw new Error('Unlimited plan not configured');
        }

        const params = new URLSearchParams({
          'payment_method_types[]': 'card',
          'line_items[0][price]': STRIPE_UNLIMITED_PRICE_ID,
          'line_items[0][quantity]': '1',
          'line_items[1][price_data][currency]': 'usd',
          'line_items[1][price_data][product_data][name]': 'Wallet Credit',
          'line_items[1][price_data][unit_amount]': walletTopupCents.toString(),
          'line_items[1][quantity]': '1',
          'mode': 'subscription',
          'success_url': successUrl,
          'cancel_url': cancelUrl,
        });

        params.append('metadata[user_id]', userId);
        params.append('metadata[type]', 'first_login_combined');
        params.append('metadata[inbound_plan]', inboundPlan || '');
        params.append('metadata[outbound_plan]', outboundPlan || '');
        params.append('metadata[wallet_topup_cents]', walletTopupCents.toString());
        params.append('subscription_data[metadata][user_id]', userId);
        params.append('subscription_data[metadata][plan]', 'unlimited');

        const response = await fetch(`${baseUrl}/checkout/sessions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: params.toString(),
        });

        if (!response.ok) {
          const error = await response.text();
          console.error('Stripe API error:', error);
          throw new Error('Failed to create combined checkout session');
        }

        const session = await response.json();
        checkoutUrl = session.url;
      } else if (needsSubscription) {
        // Only subscription needed
        if (!STRIPE_UNLIMITED_PRICE_ID) {
          throw new Error('Unlimited plan not configured');
        }

        const params = new URLSearchParams({
          'payment_method_types[]': 'card',
          'line_items[0][price]': STRIPE_UNLIMITED_PRICE_ID,
          'line_items[0][quantity]': '1',
          'mode': 'subscription',
          'success_url': successUrl,
          'cancel_url': cancelUrl,
        });

        params.append('metadata[user_id]', userId);
        params.append('metadata[type]', 'first_login_subscription');
        params.append('metadata[inbound_plan]', inboundPlan || '');
        params.append('metadata[outbound_plan]', outboundPlan || '');
        params.append('subscription_data[metadata][user_id]', userId);
        params.append('subscription_data[metadata][plan]', 'unlimited');

        const response = await fetch(`${baseUrl}/checkout/sessions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: params.toString(),
        });

        if (!response.ok) {
          const error = await response.text();
          console.error('Stripe API error:', error);
          throw new Error('Failed to create subscription session');
        }

        const session = await response.json();
        checkoutUrl = session.url;
      } else {
        // Only wallet needed
        const params = new URLSearchParams({
          'payment_method_types[]': 'card',
          'line_items[0][price_data][currency]': 'usd',
          'line_items[0][price_data][product_data][name]': 'Initial Wallet Credit',
          'line_items[0][price_data][unit_amount]': walletTopupCents.toString(),
          'line_items[0][quantity]': '1',
          'mode': 'payment',
          'success_url': successUrl,
          'cancel_url': cancelUrl,
        });

        params.append('metadata[user_id]', userId);
        params.append('metadata[type]', 'first_login_wallet');
        params.append('metadata[inbound_plan]', inboundPlan || '');
        params.append('metadata[outbound_plan]', outboundPlan || '');
        params.append('metadata[amount_cents]', walletTopupCents.toString());

        const response = await fetch(`${baseUrl}/checkout/sessions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: params.toString(),
        });

        if (!response.ok) {
          const error = await response.text();
          console.error('Stripe API error:', error);
          throw new Error('Failed to create wallet checkout session');
        }

        const session = await response.json();
        checkoutUrl = session.url;
      }

    } else {
      return new Response(
        JSON.stringify({ error: 'Invalid checkout type' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(
      JSON.stringify({ url: checkoutUrl }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Checkout error:', error);
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