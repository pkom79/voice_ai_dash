import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface BillingAccount {
  user_id: string;
  stripe_customer_id: string | null;
  wallet_cents: number | null;
  inbound_plan: string | null;
  outbound_plan: string | null;
  inbound_rate_cents: number | null;
  outbound_rate_cents: number | null;
  month_spent_cents: number | null;
  users: {
    email: string | null;
    first_name: string | null;
    last_name: string | null;
    business_name: string | null;
  } | null;
}

interface UsageSummary {
  totalCents: number;
  totalSeconds: number;
  totalMinutes: number;
  avgRateCents: number;
}

async function getSecret(key: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('app_secrets')
    .select('value')
    .eq('key', key)
    .maybeSingle();

  if (error || !data?.value) {
    console.warn(`Secret ${key} not found`, error?.message);
    return null;
  }

  return data.value;
}

async function stripeRequest(
  secret: string,
  endpoint: string,
  method: string,
  params: Record<string, string>
): Promise<any> {
  const url = `https://api.stripe.com/v1${endpoint}`;
  const body = new URLSearchParams(params).toString();

  const response = await fetch(url, {
    method,
    headers: {
      'Authorization': `Bearer ${secret}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Stripe API error:', errorText);
    throw new Error(`Stripe API request failed (${response.status})`);
  }

  return response.json();
}

async function createStripeInvoice(
  secret: string,
  customerId: string,
  subtotalCents: number,
  walletAppliedCents: number,
  periodStart: Date,
  periodEnd: Date,
  usage: UsageSummary,
  metadata: Record<string, string>
) {
  const invoice = await stripeRequest(secret, '/invoices', 'POST', {
    customer: customerId,
    auto_advance: 'true',
    collection_method: 'charge_automatically',
    description: `Voice AI usage ${periodStart.toISOString().slice(0, 10)} - ${periodEnd
      .toISOString()
      .slice(0, 10)}`,
    'metadata[user_id]': metadata.user_id || '',
    'metadata[period_start]': periodStart.toISOString(),
    'metadata[period_end]': periodEnd.toISOString(),
  });

  await stripeRequest(secret, `/invoices/${invoice.id}/add_lines`, 'POST', {
    'lines[0][description]': `Usage: ${usage.totalMinutes.toFixed(2)} min @ $${(usage.avgRateCents / 100).toFixed(2)}/min`,
    'lines[0][amount]': subtotalCents.toString(),
    'lines[0][currency]': 'usd',
  });

  if (walletAppliedCents > 0) {
    await stripeRequest(secret, `/invoices/${invoice.id}/add_lines`, 'POST', {
      'lines[0][description]': 'Wallet credit applied',
      'lines[0][amount]': (-walletAppliedCents).toString(),
      'lines[0][currency]': 'usd',
    });
  }

  return stripeRequest(secret, `/invoices/${invoice.id}/finalize`, 'POST', {});
}

function getBillingPeriod() {
  const now = new Date();
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const periodStart = new Date(Date.UTC(periodEnd.getUTCFullYear(), periodEnd.getUTCMonth() - 1, 1));
  return { periodStart, periodEnd };
}

async function fetchUsageSummary(userId: string, start: Date, end: Date): Promise<UsageSummary> {
  const { data, error } = await supabase
    .from('usage_logs')
    .select('cost_cents, seconds_used')
    .eq('user_id', userId)
    .gte('created_at', start.toISOString())
    .lt('created_at', end.toISOString());

  if (error) {
    throw error;
  }

  let totalCents = 0;
  let totalSeconds = 0;

  for (const log of data || []) {
    totalCents += log.cost_cents || 0;
    totalSeconds += log.seconds_used || 0;
  }

  const totalMinutes = totalSeconds / 60;
  const avgRateCents = totalMinutes > 0 ? Math.round(totalCents / totalMinutes) : 0;

  return {
    totalCents,
    totalSeconds,
    totalMinutes,
    avgRateCents,
  };
}

function describeAccount(account: BillingAccount) {
  const nameParts = [
    account.users?.business_name,
    account.users?.first_name,
    account.users?.last_name,
  ].filter(Boolean);
  if (nameParts.length > 0) {
    return nameParts.join(' ').trim();
  }
  return account.user_id;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = req.body ? await req.json().catch(() => ({})) : {};
    const dryRun = Boolean(body?.dryRun);
    const testMode = Boolean(body?.testMode);
    const scheduledBy = body?.scheduledBy || 'manual';

    const { periodStart, periodEnd } = getBillingPeriod();
    console.log(
      `[PPU] Starting monthly billing close | Period ${periodStart.toISOString()} - ${periodEnd.toISOString()} | dryRun=${dryRun} testMode=${testMode}`
    );

    const { data: accounts, error: accountsError } = await supabase
      .from('billing_accounts')
      .select(
        `
        user_id,
        stripe_customer_id,
        wallet_cents,
        month_spent_cents,
        inbound_plan,
        outbound_plan,
        inbound_rate_cents,
        outbound_rate_cents,
        users:user_id (
          first_name,
          last_name,
          business_name
        )
      `
      )
      .or('inbound_plan.eq.inbound_pay_per_use,outbound_plan.eq.outbound_pay_per_use');

    if (accountsError) {
      throw new Error(accountsError.message);
    }

    const targetAccounts = (accounts || []).filter((acct) => acct.user_id);
    const limitedAccounts = testMode ? targetAccounts.slice(0, 5) : targetAccounts;

    if (limitedAccounts.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No PPU accounts found to process',
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
          processed: 0,
          invoicesCreated: 0,
          dryRun,
          testMode,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const stripeSecret =
      dryRun || testMode ? null : await getSecret('STRIPE_SECRET_KEY');

    let processed = 0;
    let invoicesCreated = 0;
    let totalWalletApplied = 0;
    let totalCharged = 0;
    const skipped: any[] = [];
    const failures: any[] = [];
    const details: any[] = [];

    for (const account of limitedAccounts as BillingAccount[]) {
      const displayName = describeAccount(account);
      try {
        const usage = await fetchUsageSummary(account.user_id, periodStart, periodEnd);

        if (usage.totalCents === 0) {
          skipped.push({
            userId: account.user_id,
            name: displayName,
            reason: 'no_usage',
          });
          if (!dryRun && !testMode) {
            await supabase.rpc('reset_monthly_billing_tracking', { p_user_id: account.user_id });
          }
          continue;
        }

        const walletBalance = account.wallet_cents || 0;
        const walletApplied = Math.min(walletBalance, usage.totalCents);
        const amountToCharge = usage.totalCents - walletApplied;

        processed += 1;
        totalWalletApplied += walletApplied;

        if (dryRun || testMode) {
          details.push({
            userId: account.user_id,
            name: displayName,
            usageCents: usage.totalCents,
            walletApplied,
            amountToCharge,
          });
          continue;
        }

        if (amountToCharge > 0 && !stripeSecret) {
          throw new Error('Stripe secret key is not configured; cannot create invoices');
        }

        let stripeInvoiceId: string | null = null;
        let stripeInvoiceUrl: string | null = null;
        let invoiceStatus = 'wallet_only';

        if (amountToCharge > 0) {
          if (!account.stripe_customer_id) {
            throw new Error('Missing Stripe customer ID');
          }

          const finalizedInvoice = await createStripeInvoice(
            stripeSecret!,
            account.stripe_customer_id,
            usage.totalCents,
            walletApplied,
            periodStart,
            periodEnd,
            usage,
            {
              user_id: account.user_id,
              scheduled_by: scheduledBy,
            }
          );

          stripeInvoiceId = finalizedInvoice.id;
          stripeInvoiceUrl = finalizedInvoice.hosted_invoice_url;
          invoiceStatus = finalizedInvoice.status || 'finalized';
          invoicesCreated += 1;
          totalCharged += amountToCharge;
        } else {
          // Wallet covered the entire invoice, just mark as paid
          totalCharged += 0;
          invoiceStatus = 'paid';
        }

        await supabase.from('billing_invoices').insert({
          user_id: account.user_id,
          billing_cycle_start: periodStart.toISOString(),
          billing_cycle_end: periodEnd.toISOString(),
          subtotal_cents: usage.totalCents,
          wallet_applied_cents: walletApplied,
          total_charged_cents: amountToCharge,
          status: invoiceStatus,
          stripe_invoice_id: stripeInvoiceId,
          stripe_invoice_url: stripeInvoiceUrl,
          metadata: {
            usage_minutes: usage.totalMinutes,
            avg_rate_cents: usage.avgRateCents,
            scheduled_by: scheduledBy,
          },
        });

        if (walletApplied > 0) {
          const newBalance = walletBalance - walletApplied;
          await supabase
            .from('billing_accounts')
            .update({ wallet_cents: newBalance })
            .eq('user_id', account.user_id);

          await supabase.rpc('log_wallet_transaction', {
            p_user_id: account.user_id,
            p_type: 'deduction',
            p_amount_cents: walletApplied,
            p_balance_before_cents: walletBalance,
            p_balance_after_cents: newBalance,
            p_reason: `Applied to monthly usage ${periodStart.toISOString().slice(0, 7)}`,
            p_metadata: {
              period_start: periodStart.toISOString(),
              period_end: periodEnd.toISOString(),
            },
          });
        }

        await supabase.rpc('reset_monthly_billing_tracking', { p_user_id: account.user_id });

        details.push({
          userId: account.user_id,
          name: displayName,
          usageCents: usage.totalCents,
          walletApplied,
          amountToCharge,
          invoiceStatus,
          stripeInvoiceId,
        });
      } catch (error) {
        console.error(`[PPU] Failed to process ${displayName}:`, error);
        failures.push({
          userId: account.user_id,
          name: displayName,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: failures.length === 0,
        dryRun,
        testMode,
        scheduledBy,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        evaluatedAccounts: limitedAccounts.length,
        processed,
        invoicesCreated,
        walletAppliedCents: totalWalletApplied,
        totalChargedCents: totalCharged,
        skipped,
        failures,
        details,
      }),
      { status: failures.length ? 207 : 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[PPU] Fatal error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
