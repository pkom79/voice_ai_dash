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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const STRIPE_SECRET_KEY = await getSecret('STRIPE_SECRET_KEY');
    if (!STRIPE_SECRET_KEY) {
      throw new Error('Stripe secret key not configured');
    }

    const { userId, subscriptionId } = await req.json();

    if (!userId || !subscriptionId) {
      return new Response(
        JSON.stringify({ error: 'Missing userId or subscriptionId' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const subscriptionResponse = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
      headers: {
        'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
      },
    });

    if (!subscriptionResponse.ok) {
      throw new Error('Failed to fetch subscription from Stripe');
    }

    const subscription = await subscriptionResponse.json();
    const customerId = subscription.customer;

    const { data: billing } = await supabase
      .from('billing_accounts')
      .select('wallet_cents, stripe_customer_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (!billing) {
      return new Response(
        JSON.stringify({ error: 'Billing account not found' }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    let customerIdToUpdate = billing.stripe_customer_id;
    if (!customerIdToUpdate) {
      customerIdToUpdate = customerId;
    }

    const plan = subscription.metadata?.plan || 'unlimited';
    const nextPaymentAt = new Date(subscription.current_period_end * 1000).toISOString();

    await supabase
      .from('billing_accounts')
      .update({
        inbound_plan: 'inbound_unlimited',
        stripe_subscription_id: subscriptionId,
        stripe_customer_id: customerIdToUpdate,
        next_payment_at: nextPaymentAt,
      })
      .eq('user_id', userId);

    const walletCents = billing.wallet_cents || 0;
    const walletAppliedCents = Math.min(walletCents, 50000);

    let walletApplied = false;
    if (walletAppliedCents > 0) {
      const invoiceId = subscription.latest_invoice;

      if (invoiceId && typeof invoiceId === 'string') {
        const addLineResponse = await fetch(`https://api.stripe.com/v1/invoices/${invoiceId}/lines`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            'description': 'Wallet credit applied',
            'amount': (-walletAppliedCents).toString(),
            'currency': 'usd',
          }).toString(),
        });

        if (addLineResponse.ok) {
          const balanceBefore = walletCents;
          const balanceAfter = balanceBefore - walletAppliedCents;

          await supabase
            .from('billing_accounts')
            .update({ wallet_cents: balanceAfter })
            .eq('user_id', userId);

          await supabase.from('wallet_transactions').insert({
            user_id: userId,
            type: 'deduction',
            amount_cents: walletAppliedCents,
            balance_before_cents: balanceBefore,
            balance_after_cents: balanceAfter,
            reason: 'Applied to Unlimited plan first month',
            stripe_payment_id: invoiceId,
          });

          walletApplied = true;
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        plan,
        subscriptionId,
        nextPaymentAt,
        walletApplied,
        walletAppliedAmount: walletApplied ? walletAppliedCents : 0,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Sync error:', error);
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
