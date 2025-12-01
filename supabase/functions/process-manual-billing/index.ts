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

interface UsageSummary {
    totalCents: number;
    totalSeconds: number;
    totalMinutes: number;
    avgRateCents: number;
}

async function getSecret(key: string): Promise<string | null> {
    const envValue = Deno.env.get(key);
    if (envValue) {
        return envValue;
    }
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
        description: `Manual billing: ${periodStart.toISOString().slice(0, 10)} - ${periodEnd
            .toISOString()
            .slice(0, 10)}`,
        'metadata[user_id]': metadata.user_id || '',
        'metadata[period_start]': periodStart.toISOString(),
        'metadata[period_end]': periodEnd.toISOString(),
        'metadata[type]': 'manual_bill',
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

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 200, headers: corsHeaders });
    }

    try {
        const { userId, startDate, endDate, dryRun } = await req.json();

        if (!userId || !startDate || !endDate) {
            return new Response(JSON.stringify({ error: 'Missing required fields' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const start = new Date(startDate);
        const end = new Date(endDate);

        // Fetch billing account
        const { data: account, error: accountError } = await supabase
            .from('billing_accounts')
            .select('user_id, stripe_customer_id, wallet_cents')
            .eq('user_id', userId)
            .single();

        if (accountError || !account) {
            throw new Error('Billing account not found');
        }

        // Fetch usage
        const usage = await fetchUsageSummary(userId, start, end);
        const totalCostCents = usage.totalCents;
        const walletBalanceCents = account.wallet_cents || 0;

        // Calculate application
        const walletAppliedCents = Math.min(walletBalanceCents, totalCostCents);
        const amountToChargeCents = totalCostCents - walletAppliedCents;

        const result = {
            userId,
            periodStart: start.toISOString(),
            periodEnd: end.toISOString(),
            usage,
            walletBalanceCents,
            walletAppliedCents,
            amountToChargeCents,
            dryRun,
            status: 'preview',
            invoiceId: null,
        };

        if (!dryRun) {
            const stripeSecret = await getSecret('STRIPE_SECRET_KEY');
            if (!stripeSecret) {
                throw new Error('Stripe secret not configured');
            }

            // 1. Charge Stripe if needed
            if (amountToChargeCents > 0) {
                if (!account.stripe_customer_id) {
                    throw new Error('No Stripe customer ID for user');
                }
                const invoice = await createStripeInvoice(
                    stripeSecret,
                    account.stripe_customer_id,
                    totalCostCents,
                    walletAppliedCents,
                    start,
                    end,
                    usage,
                    { user_id: userId }
                );
                result.invoiceId = invoice.id;
            }

            // 2. Deduct from wallet if needed
            if (walletAppliedCents > 0) {
                const { error: walletError } = await supabase.rpc('log_wallet_transaction', {
                    p_user_id: userId,
                    p_amount_cents: -walletAppliedCents,
                    p_description: `Manual usage charge: ${start.toISOString().slice(0, 10)} to ${end.toISOString().slice(0, 10)}`,
                    p_transaction_type: 'usage_charge',
                    p_metadata: {
                        period_start: start.toISOString(),
                        period_end: end.toISOString(),
                        manual_billing: true
                    }
                });
                if (walletError) throw walletError;

                // Update local wallet balance for response
                result.walletBalanceCents -= walletAppliedCents;
            }

            // 3. Record invoice in DB
            const { error: invoiceDbError } = await supabase.from('billing_invoices').insert({
                user_id: userId,
                amount_cents: totalCostCents,
                status: amountToChargeCents > 0 ? 'open' : 'paid', // If fully covered by wallet, it's paid
                billing_period_start: start.toISOString(),
                billing_period_end: end.toISOString(),
                stripe_invoice_id: result.invoiceId,
                metadata: {
                    wallet_applied: walletAppliedCents,
                    manual_billing: true
                }
            });
            if (invoiceDbError) console.error('Error inserting invoice record:', invoiceDbError);

            result.status = 'processed';
        }

        return new Response(JSON.stringify(result), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (error: any) {
        console.error('Error processing manual billing:', error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
