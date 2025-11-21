/**
 * Stripe Service - Dynamic Inline Pricing
 *
 * Handles all Stripe payment processing with flexible per-user pricing.
 * Uses inline invoice items for PPU charges and standard subscriptions for Unlimited.
 */

import { supabase } from '../lib/supabase';

const STRIPE_SECRET_KEY = import.meta.env.VITE_STRIPE_SECRET_KEY;
const STRIPE_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
const STRIPE_UNLIMITED_PRICE_ID = import.meta.env.VITE_STRIPE_UNLIMITED_PRICE_ID;

// Stripe API base URL
const STRIPE_API_URL = 'https://api.stripe.com/v1';

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Convert cents to dollars with proper decimal formatting
 */
export function centsToDollars(cents: number): number {
  return Math.round(cents) / 100;
}

/**
 * Convert dollars to cents
 */
export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

/**
 * Round to nearest cent (for calculations)
 */
export function roundToCents(amount: number): number {
  return Math.round(amount);
}

/**
 * Make authenticated Stripe API request
 */
async function stripeRequest(
  endpoint: string,
  method: string = 'GET',
  data?: Record<string, any>
): Promise<any> {
  if (!STRIPE_SECRET_KEY) {
    throw new Error('Stripe secret key not configured');
  }

  const url = `${STRIPE_API_URL}${endpoint}`;
  const headers: HeadersInit = {
    'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  let body: string | undefined;
  if (data && method !== 'GET') {
    body = new URLSearchParams(data).toString();
  }

  const response = await fetch(url, {
    method,
    headers,
    body,
  });

  if (!response.ok) {
    const error = await response.json();
    console.error('Stripe API error:', error);
    throw new Error(error.error?.message || 'Stripe API request failed');
  }

  return response.json();
}

// ============================================
// CUSTOMER MANAGEMENT
// ============================================

/**
 * Create a Stripe customer for a user
 */
export async function createStripeCustomer(
  userId: string,
  email: string,
  name: string,
  metadata?: Record<string, string>
): Promise<string> {
  const customer = await stripeRequest('/customers', 'POST', {
    email,
    name,
    metadata: {
      user_id: userId,
      ...metadata,
    },
  });

  // Update billing account with Stripe customer ID
  await supabase
    .from('billing_accounts')
    .update({ stripe_customer_id: customer.id })
    .eq('user_id', userId);

  return customer.id;
}

/**
 * Get or create Stripe customer for user
 */
export async function getOrCreateCustomer(
  userId: string,
  email: string,
  name: string
): Promise<string> {
  // Check if customer already exists
  const { data: billing } = await supabase
    .from('billing_accounts')
    .select('stripe_customer_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (billing?.stripe_customer_id) {
    return billing.stripe_customer_id;
  }

  // Create new customer
  return createStripeCustomer(userId, email, name);
}

// ============================================
// CHECKOUT SESSIONS (For wallet top-ups)
// ============================================

/**
 * Create Checkout Session for wallet top-up
 */
export async function createCheckoutSession(
  userId: string,
  email: string,
  name: string,
  amountCents: number,
  successUrl: string,
  cancelUrl: string
): Promise<{ sessionId: string; url: string }> {
  const customerId = await getOrCreateCustomer(userId, email, name);

  const session = await stripeRequest('/checkout/sessions', 'POST', {
    customer: customerId,
    'payment_method_types[]': 'card',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][product_data][name]': 'Wallet Top-Up',
    'line_items[0][price_data][product_data][description]': `Add $${centsToDollars(amountCents)} to wallet`,
    'line_items[0][price_data][unit_amount]': amountCents,
    'line_items[0][quantity]': 1,
    mode: 'payment',
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      user_id: userId,
      type: 'wallet_topup',
    },
  });

  return {
    sessionId: session.id,
    url: session.url,
  };
}

// ============================================
// SUBSCRIPTION MANAGEMENT
// ============================================

/**
 * Create Unlimited subscription ($500/month)
 */
export async function createUnlimitedSubscription(
  userId: string,
  email: string,
  name: string,
  walletCents: number
): Promise<{ subscriptionId: string; invoiceId: string }> {
  const customerId = await getOrCreateCustomer(userId, email, name);

  // Calculate wallet application (max $500 = 50000 cents)
  const walletAppliedCents = Math.min(walletCents, 50000);

  // Create subscription
  const subscription = await stripeRequest('/subscriptions', 'POST', {
    customer: customerId,
    'items[0][price]': STRIPE_UNLIMITED_PRICE_ID,
    'payment_behavior': 'default_incomplete',
    'payment_settings[save_default_payment_method]': 'on_subscription',
    metadata: {
      user_id: userId,
      plan: 'unlimited',
    },
  });

  // If wallet credits available, apply to first invoice
  if (walletAppliedCents > 0) {
    await stripeRequest('/invoices/' + subscription.latest_invoice + '/add_lines', 'POST', {
      'lines[0][description]': 'Wallet credit applied',
      'lines[0][amount]': -walletAppliedCents,
      'lines[0][currency]': 'usd',
    });

    // Deduct from user wallet
    await supabase.rpc('log_wallet_transaction', {
      p_user_id: userId,
      p_type: 'deduction',
      p_amount_cents: walletAppliedCents,
      p_balance_before_cents: walletCents,
      p_balance_after_cents: walletCents - walletAppliedCents,
      p_reason: 'Applied to Unlimited plan first month',
      p_metadata: { invoice_id: subscription.latest_invoice },
    });

    await supabase
      .from('billing_accounts')
      .update({ wallet_cents: walletCents - walletAppliedCents })
      .eq('user_id', userId);
  }

  // Update billing account
  await supabase
    .from('billing_accounts')
    .update({
      inbound_plan: 'inbound_unlimited',
      stripe_subscription_id: subscription.id,
      next_payment_at: new Date(subscription.current_period_end * 1000).toISOString(),
    })
    .eq('user_id', userId);

  return {
    subscriptionId: subscription.id,
    invoiceId: subscription.latest_invoice,
  };
}

/**
 * Switch user from Unlimited to Pay Per Use
 */
export async function switchToPPU(
  userId: string,
  immediate: boolean = false
): Promise<boolean> {
  const { data: billing } = await supabase
    .from('billing_accounts')
    .select('stripe_subscription_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (!billing?.stripe_subscription_id) {
    return false;
  }

  // Cancel subscription at period end or immediately
  await stripeRequest(`/subscriptions/${billing.stripe_subscription_id}`, 'DELETE', {
    cancel_at_period_end: !immediate,
  });

  // Update billing account
  await supabase
    .from('billing_accounts')
    .update({
      inbound_plan: 'inbound_pay_per_use',
      stripe_subscription_id: null,
      next_payment_at: immediate ? null : billing.next_payment_at,
    })
    .eq('user_id', userId);

  return true;
}

/**
 * Cancel subscription completely
 */
export async function cancelSubscription(userId: string): Promise<boolean> {
  return switchToPPU(userId, true);
}

// ============================================
// INVOICE MANAGEMENT (PPU Monthly Billing)
// ============================================

/**
 * Create PPU invoice with wallet application
 */
export async function createPPUInvoice(
  userId: string,
  subtotalCents: number,
  walletCents: number,
  periodStart: Date,
  periodEnd: Date,
  usageDetails: { minutes: number; rate: number }
): Promise<{ invoiceId: string; totalCharged: number }> {
  const { data: billing } = await supabase
    .from('billing_accounts')
    .select('stripe_customer_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (!billing?.stripe_customer_id) {
    throw new Error('No Stripe customer found');
  }

  // Calculate wallet application
  const walletAppliedCents = Math.min(walletCents, subtotalCents);
  const totalChargedCents = subtotalCents - walletAppliedCents;

  // Create invoice
  const invoice = await stripeRequest('/invoices', 'POST', {
    customer: billing.stripe_customer_id,
    auto_advance: true,
    collection_method: 'charge_automatically',
    description: `Voice AI usage for ${periodStart.toLocaleDateString()} - ${periodEnd.toLocaleDateString()}`,
    metadata: {
      user_id: userId,
      period_start: periodStart.toISOString(),
      period_end: periodEnd.toISOString(),
    },
  });

  // Add usage line item
  await stripeRequest(`/invoices/${invoice.id}/add_lines`, 'POST', {
    'lines[0][description]': `Voice AI minutes: ${usageDetails.minutes.toFixed(2)} min @ $${centsToDollars(usageDetails.rate)}/min`,
    'lines[0][amount]': subtotalCents,
    'lines[0][currency]': 'usd',
  });

  // Add wallet credit if applicable
  if (walletAppliedCents > 0) {
    await stripeRequest(`/invoices/${invoice.id}/add_lines`, 'POST', {
      'lines[0][description]': 'Wallet credit applied',
      'lines[0][amount]': -walletAppliedCents,
      'lines[0][currency]': 'usd',
    });
  }

  // Finalize invoice
  const finalizedInvoice = await stripeRequest(`/invoices/${invoice.id}/finalize`, 'POST');

  // Record in billing_invoices table
  await supabase.from('billing_invoices').insert({
    user_id: userId,
    billing_cycle_start: periodStart.toISOString(),
    billing_cycle_end: periodEnd.toISOString(),
    subtotal_cents: subtotalCents,
    wallet_applied_cents: walletAppliedCents,
    total_charged_cents: totalChargedCents,
    status: 'finalized',
    stripe_invoice_id: finalizedInvoice.id,
    stripe_invoice_url: finalizedInvoice.hosted_invoice_url,
  });

  // Deduct wallet if used
  if (walletAppliedCents > 0) {
    await supabase.rpc('log_wallet_transaction', {
      p_user_id: userId,
      p_type: 'deduction',
      p_amount_cents: walletAppliedCents,
      p_balance_before_cents: walletCents,
      p_balance_after_cents: walletCents - walletAppliedCents,
      p_reason: 'Applied to monthly PPU invoice',
      p_stripe_payment_id: finalizedInvoice.id,
    });

    await supabase
      .from('billing_accounts')
      .update({ wallet_cents: walletCents - walletAppliedCents })
      .eq('user_id', userId);
  }

  return {
    invoiceId: finalizedInvoice.id,
    totalCharged: totalChargedCents,
  };
}

// ============================================
// CUSTOMER PORTAL
// ============================================

/**
 * Create Customer Portal session
 */
export async function createCustomerPortalSession(
  userId: string,
  returnUrl: string
): Promise<string> {
  const { data: billing } = await supabase
    .from('billing_accounts')
    .select('stripe_customer_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (!billing?.stripe_customer_id) {
    throw new Error('No Stripe customer found');
  }

  const session = await stripeRequest('/billing_portal/sessions', 'POST', {
    customer: billing.stripe_customer_id,
    return_url: returnUrl,
  });

  return session.url;
}

// ============================================
// UPCOMING INVOICE ESTIMATE
// ============================================

/**
 * Get upcoming invoice estimate
 */
export async function getUpcomingInvoice(userId: string): Promise<any> {
  const { data: billing } = await supabase
    .from('billing_accounts')
    .select('stripe_customer_id, stripe_subscription_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (!billing?.stripe_customer_id) {
    return null;
  }

  try {
    const invoice = await stripeRequest(
      `/invoices/upcoming?customer=${billing.stripe_customer_id}`,
      'GET'
    );
    return invoice;
  } catch (error) {
    // No upcoming invoice
    return null;
  }
}
