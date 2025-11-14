import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function getSecret(key: string): Promise<string | null> {
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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, stripe-signature",
};

async function verifyStripeSignature(
  payload: string,
  signatureHeader: string,
  secret: string
): Promise<boolean> {
  try {
    const parts = signatureHeader.split(',');
    const timestamp = parts.find(p => p.startsWith('t='))?.split('=')[1];
    const signatures = parts.filter(p => p.startsWith('v1='));

    if (!timestamp || signatures.length === 0) {
      console.error('Invalid signature header format');
      return false;
    }

    const signedPayload = `${timestamp}.${payload}`;
    const encoder = new TextEncoder();
    const data = encoder.encode(signedPayload);

    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signatureBuffer = await crypto.subtle.sign('HMAC', key, data);
    const expectedSignature = Array.from(new Uint8Array(signatureBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    return signatures.some(sig => {
      const providedSig = sig.split('=')[1];
      return providedSig === expectedSignature;
    });
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

async function handleCheckoutCompleted(event: any): Promise<void> {
  const session = event.data.object;
  const userId = session.metadata?.user_id;
  const type = session.metadata?.type;
  const customerId = session.customer;

  console.log('Checkout session completed:', {
    sessionId: session.id,
    userId,
    type,
    customerId,
    amountTotal: session.amount_total,
    metadata: session.metadata,
  });

  if (!userId) {
    console.error('No user_id in session metadata. Cannot process payment.', {
      sessionId: session.id,
      customerId,
      customerEmail: session.customer_details?.email,
      metadata: session.metadata,
    });
    return;
  }

  if (type === 'wallet_topup') {
    const amountCents = session.amount_total;

    const { data: billing } = await supabase
      .from('billing_accounts')
      .select('wallet_cents, month_added_cents, stripe_customer_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (!billing) {
      console.error('No billing account found for user:', userId);
      return;
    }

    const balanceBefore = billing.wallet_cents || 0;
    const balanceAfter = balanceBefore + amountCents;

    const updateData: any = {
      wallet_cents: balanceAfter,
      month_added_cents: (billing.month_added_cents || 0) + amountCents,
    };

    if (!billing.stripe_customer_id && customerId) {
      updateData.stripe_customer_id = customerId;
    }

    await supabase
      .from('billing_accounts')
      .update(updateData)
      .eq('user_id', userId);

    await supabase.from('wallet_transactions').insert({
      user_id: userId,
      type: 'top_up',
      amount_cents: amountCents,
      balance_before_cents: balanceBefore,
      balance_after_cents: balanceAfter,
      reason: 'Wallet top-up via Stripe Checkout',
      stripe_payment_id: session.payment_intent,
    });

    console.log(`Wallet top-up completed for user ${userId}: +$${amountCents / 100}`);
  } else if (type === 'unlimited_upgrade') {
    const walletCents = parseInt(session.metadata?.wallet_cents || '0', 10);
    const subscriptionId = session.subscription;

    const { data: billing } = await supabase
      .from('billing_accounts')
      .select('wallet_cents, stripe_customer_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (!billing) {
      console.error('No billing account found for user:', userId);
      return;
    }

    if (!billing.stripe_customer_id && customerId) {
      await supabase
        .from('billing_accounts')
        .update({ stripe_customer_id: customerId })
        .eq('user_id', userId);
    }

    const walletAppliedCents = Math.min(walletCents, 50000);

    if (walletAppliedCents > 0 && subscriptionId) {
      try {
        const STRIPE_SECRET_KEY = await getSecret('STRIPE_SECRET_KEY');
        if (!STRIPE_SECRET_KEY) {
          throw new Error('Stripe secret key not configured');
        }

        const subscriptionResponse = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
          headers: {
            'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
          },
        });

        if (subscriptionResponse.ok) {
          const subscription = await subscriptionResponse.json();
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
              const balanceBefore = billing.wallet_cents || 0;
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

              console.log(`Wallet credit applied for user ${userId}: -$${walletAppliedCents / 100}`);
            }
          }
        }
      } catch (error) {
        console.error('Error applying wallet credit:', error);
      }
    }

    console.log(`Unlimited upgrade completed for user ${userId}`);
  }
}

async function handleInvoiceFinalized(event: any): Promise<void> {
  const invoice = event.data.object;
  const userId = invoice.metadata?.user_id;

  if (!userId) {
    return;
  }

  await supabase
    .from('billing_accounts')
    .update({ month_spent_cents: 0 })
    .eq('user_id', userId);

  await supabase
    .from('billing_invoices')
    .update({ status: 'finalized' })
    .eq('stripe_invoice_id', invoice.id);

  console.log(`Invoice finalized for user ${userId}: ${invoice.id}`);
}

async function handleInvoicePaid(event: any): Promise<void> {
  const invoice = event.data.object;
  const userId = invoice.metadata?.user_id;

  if (!userId) {
    return;
  }

  await supabase
    .from('billing_accounts')
    .update({ grace_until: null })
    .eq('user_id', userId);

  await supabase
    .from('billing_invoices')
    .update({ status: 'paid' })
    .eq('stripe_invoice_id', invoice.id);

  console.log(`Invoice paid for user ${userId}: ${invoice.id}`);
}

async function handlePaymentFailed(event: any): Promise<void> {
  const invoice = event.data.object;
  const userId = invoice.metadata?.user_id;

  if (!userId) {
    return;
  }

  const graceUntil = new Date();
  graceUntil.setDate(graceUntil.getDate() + 7);

  await supabase
    .from('billing_accounts')
    .update({ grace_until: graceUntil.toISOString() })
    .eq('user_id', userId);

  await supabase
    .from('billing_invoices')
    .update({ status: 'failed' })
    .eq('stripe_invoice_id', invoice.id);

  await supabase.from('audit_logs').insert({
    action: 'payment_failed',
    target_user_id: userId,
    details: {
      invoice_id: invoice.id,
      grace_until: graceUntil.toISOString(),
    },
  });

  console.log(`Payment failed for user ${userId}. Grace period set until ${graceUntil.toISOString()}`);
}

async function handleSubscriptionUpdated(event: any): Promise<void> {
  const subscription = event.data.object;
  let userId = subscription.metadata?.user_id;

  if (!userId) {
    const customerId = subscription.customer;
    const { data: billing } = await supabase
      .from('billing_accounts')
      .select('user_id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle();

    if (billing) {
      userId = billing.user_id;
    }
  }

  if (!userId) {
    console.log('No user_id found for subscription:', subscription.id);
    return;
  }

  const plan = subscription.metadata?.plan || 'unlimited';
  const nextPaymentAt = new Date(subscription.current_period_end * 1000).toISOString();

  await supabase
    .from('billing_accounts')
    .update({
      billing_plan: plan,
      stripe_subscription_id: subscription.id,
      next_payment_at: nextPaymentAt,
    })
    .eq('user_id', userId);

  console.log(`Subscription updated for user ${userId}: ${subscription.id}`);
}

async function handleSubscriptionDeleted(event: any): Promise<void> {
  const subscription = event.data.object;
  const userId = subscription.metadata?.user_id;

  if (!userId) {
    return;
  }

  await supabase
    .from('billing_accounts')
    .update({
      billing_plan: 'pay_per_use',
      stripe_subscription_id: null,
      next_payment_at: null,
    })
    .eq('user_id', userId);

  console.log(`Subscription cancelled for user ${userId}: ${subscription.id}`);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const STRIPE_WEBHOOK_SECRET = await getSecret('STRIPE_WEBHOOK_SECRET');

    if (!STRIPE_WEBHOOK_SECRET) {
      throw new Error('Stripe webhook secret not configured');
    }

    const signature = req.headers.get('stripe-signature');
    if (!signature) {
      throw new Error('No signature provided');
    }

    const payload = await req.text();

    const isValid = await verifyStripeSignature(payload, signature, STRIPE_WEBHOOK_SECRET);
    if (!isValid) {
      console.error('Invalid webhook signature');
      return new Response(JSON.stringify({ error: 'Invalid signature' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const event = JSON.parse(payload);
    console.log(`Processing webhook event: ${event.type}`);

    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event);
        break;
      case 'invoice.finalized':
        await handleInvoiceFinalized(event);
        break;
      case 'invoice.paid':
        await handleInvoicePaid(event);
        break;
      case 'invoice.payment_failed':
        await handlePaymentFailed(event);
        break;
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event);
        break;
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    await supabase.from('audit_logs').insert({
      action: 'stripe_webhook',
      details: {
        event_type: event.type,
        event_id: event.id,
      },
    });

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});