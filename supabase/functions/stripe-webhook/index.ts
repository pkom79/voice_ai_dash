import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function getSecret(key: string): Promise<string | null> {
  // First check environment variables (set via supabase secrets set)
  const envValue = Deno.env.get(key);
  if (envValue) {
    return envValue;
  }

  // Fallback to app_secrets table
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

interface WalletTopUpOptions {
  userId: string;
  amountCents: number;
  customerId?: string | null;
  paymentId?: string | null;
  reason: string;
}

async function applyWalletTopUp({
  userId,
  amountCents,
  customerId,
  paymentId,
  reason,
}: WalletTopUpOptions): Promise<void> {
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

  const updateData: Record<string, any> = {
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
    reason,
    stripe_payment_id: paymentId,
  });
}

async function markFirstLoginComplete(userId: string, customerId?: string | null): Promise<void> {
  const updateData: Record<string, any> = {
    first_login_billing_completed: true,
  };

  if (customerId) {
    updateData.stripe_customer_id = customerId;
  }

  await supabase
    .from('billing_accounts')
    .update(updateData)
    .eq('user_id', userId);
}

type InvoiceStatus = 'draft' | 'finalized' | 'paid' | 'failed' | 'cancelled';

function extractInvoiceDate(invoice: any, field: 'period_start' | 'period_end'): string {
  if (invoice?.[field]) {
    return new Date(invoice[field] * 1000).toISOString();
  }

  const linePeriod = invoice?.lines?.data?.[0]?.period?.[field === 'period_start' ? 'start' : 'end'];
  if (linePeriod) {
    return new Date(linePeriod * 1000).toISOString();
  }

  return new Date().toISOString();
}

function calculateWalletApplied(invoice: any): number {
  if (!invoice?.lines?.data) return 0;

  return invoice.lines.data.reduce((sum: number, line: any) => {
    const description = line?.description?.toLowerCase() || '';
    const isWalletLine = description.includes('wallet') || line?.metadata?.wallet_credit === true;
    if (line?.amount < 0 && isWalletLine) {
      return sum + Math.abs(line.amount);
    }
    return sum;
  }, 0);
}

function mapInvoiceStatus(stripeStatus: string): InvoiceStatus {
  switch (stripeStatus) {
    case 'paid':
      return 'paid';
    case 'uncollectible':
      return 'failed';
    case 'void':
      return 'cancelled';
    case 'open':
      return 'finalized';
    default:
      return 'draft';
  }
}

async function upsertInvoiceRecord(invoice: any, overrideStatus?: InvoiceStatus): Promise<void> {
  let userId = invoice?.metadata?.user_id;

  if (!userId) {
    const customerId = typeof invoice?.customer === 'string' ? invoice.customer : invoice?.customer?.id;
    if (customerId) {
      const { data: billingByCustomer } = await supabase
        .from('billing_accounts')
        .select('user_id')
        .eq('stripe_customer_id', customerId)
        .maybeSingle();
      userId = billingByCustomer?.user_id || userId;
    }
  }

  if (!userId && invoice?.subscription) {
    const subscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription.id;
    if (subscriptionId) {
      const { data: billingBySubscription } = await supabase
        .from('billing_accounts')
        .select('user_id')
        .eq('stripe_subscription_id', subscriptionId)
        .maybeSingle();
      userId = billingBySubscription?.user_id || userId;
    }
  }

  if (!userId) {
    return;
  }

  const billingCycleStart = extractInvoiceDate(invoice, 'period_start');
  const billingCycleEnd = extractInvoiceDate(invoice, 'period_end');
  const subtotal = typeof invoice?.subtotal === 'number'
    ? invoice.subtotal
    : typeof invoice?.amount_due === 'number'
      ? invoice.amount_due
      : invoice?.total || 0;
  const totalCharged = typeof invoice?.amount_paid === 'number' && invoice.amount_paid > 0
    ? invoice.amount_paid
    : invoice?.total || subtotal;
  const walletApplied = calculateWalletApplied(invoice);

  const record = {
    user_id: userId,
    billing_cycle_start: billingCycleStart,
    billing_cycle_end: billingCycleEnd,
    subtotal_cents: subtotal,
    wallet_applied_cents: walletApplied,
    total_charged_cents: totalCharged,
    status: overrideStatus || mapInvoiceStatus(invoice?.status),
    stripe_invoice_id: invoice.id,
    stripe_invoice_url: invoice.hosted_invoice_url,
    metadata: {
      ...(invoice.metadata || {}),
      billing_reason: invoice.billing_reason,
      invoice_number: invoice.number,
    },
  };

  const { data: existing } = await supabase
    .from('billing_invoices')
    .select('id')
    .eq('stripe_invoice_id', invoice.id)
    .maybeSingle();

  if (existing) {
    await supabase
      .from('billing_invoices')
      .update(record)
      .eq('id', existing.id);
  } else {
    await supabase.from('billing_invoices').insert(record);
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
    await applyWalletTopUp({
      userId,
      amountCents: session.amount_total,
      customerId,
      paymentId: session.payment_intent,
      reason: 'Wallet top-up via Stripe Checkout',
    });
    console.log(`Wallet top-up completed for user ${userId}: +$${session.amount_total / 100}`);
  } else if (type === 'first_login_wallet') {
    const walletTopUpCents = parseInt(session.metadata?.wallet_topup_cents || `${session.amount_total || 0}`, 10);
    if (walletTopUpCents > 0) {
      await applyWalletTopUp({
        userId,
        amountCents: walletTopUpCents,
        customerId,
        paymentId: session.payment_intent,
        reason: 'Initial wallet credit (onboarding)',
      });
    }
    await markFirstLoginComplete(userId, customerId);
    console.log(`First login wallet credit completed for user ${userId}`);
  } else if (type === 'first_login_combined') {
    const walletTopUpCents = parseInt(session.metadata?.wallet_topup_cents || '0', 10);
    if (walletTopUpCents > 0) {
      await applyWalletTopUp({
        userId,
        amountCents: walletTopUpCents,
        customerId,
        paymentId: session.payment_intent,
        reason: 'Initial wallet credit (combined onboarding)',
      });
    }
    await markFirstLoginComplete(userId, customerId);
    console.log(`First login combined payment processed for user ${userId}`);
  } else if (type === 'first_login_subscription') {
    await markFirstLoginComplete(userId, customerId);
    console.log(`First login subscription recorded for user ${userId}`);
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

  await upsertInvoiceRecord(invoice, 'finalized');

  await supabase
    .from('billing_accounts')
    .update({ month_spent_cents: 0 })
    .eq('user_id', userId);

  console.log(`Invoice finalized for user ${userId}: ${invoice.id}`);
}

async function handleInvoicePaid(event: any): Promise<void> {
  const invoice = event.data.object;
  const userId = invoice.metadata?.user_id;

  if (!userId) {
    return;
  }

  await upsertInvoiceRecord(invoice, 'paid');

  await supabase
    .from('billing_accounts')
    .update({ grace_until: null })
    .eq('user_id', userId);

  console.log(`Invoice paid for user ${userId}: ${invoice.id}`);
}

async function handlePaymentFailed(event: any): Promise<void> {
  const invoice = event.data.object;
  const userId = invoice.metadata?.user_id;

  if (!userId) {
    return;
  }

  await upsertInvoiceRecord(invoice, 'failed');

  const graceUntil = new Date();
  graceUntil.setDate(graceUntil.getDate() + 7);

  await supabase
    .from('billing_accounts')
    .update({ grace_until: graceUntil.toISOString() })
    .eq('user_id', userId);

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
      inbound_plan: 'inbound_unlimited',
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
      inbound_plan: 'inbound_pay_per_use',
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
