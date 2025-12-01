import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface SyncBillingRequest {
  userId: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    const { userId }: SyncBillingRequest = await req.json();

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "userId is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`Syncing billing balance for user: ${userId}`);

    // 1. Calculate Total Usage Cost (Lifetime)
    const { data: calls, error: callsError } = await supabase
      .from("calls")
      .select("cost, display_cost, call_started_at")
      .eq("user_id", userId);

    if (callsError) throw callsError;

    const totalUsageCents = (calls || [])
      .filter((call) => call.display_cost !== 'INCLUDED')
      .reduce((sum, call) => sum + Math.round((call.cost || 0) * 100), 0);

    // 2. Calculate Total Credits/Debits from Wallet Transactions (excluding usage deductions)
    const { data: transactions, error: txError } = await supabase
      .from("wallet_transactions")
      .select("type, amount_cents")
      .eq("user_id", userId);

    if (txError) throw txError;

    let totalCreditsCents = 0;
    let totalDebitsCents = 0;

    (transactions || []).forEach(tx => {
      if (['top_up', 'admin_credit'].includes(tx.type)) {
        totalCreditsCents += tx.amount_cents;
      } else if (['admin_debit', 'refund'].includes(tx.type)) {
        totalDebitsCents += tx.amount_cents;
      }
      // We ignore 'deduction' type as we are recalculating usage from calls directly
    });

    // 3. Calculate New Wallet Balance
    // Balance = Credits - Non-Usage Debits - Total Usage
    const newWalletCents = totalCreditsCents - totalDebitsCents - totalUsageCents;

    // 4. Calculate Current Month Usage
    const now = new Date();
    const currentMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const currentMonthUsageCents = (calls || [])
      .filter(call => {
        if (call.display_cost === 'INCLUDED') return false;
        const callDate = new Date(call.call_started_at);
        return callDate >= currentMonthStart;
      })
      .reduce((sum, call) => sum + Math.round((call.cost || 0) * 100), 0);

    console.log(`Billing Sync Results:
      Total Usage: $${(totalUsageCents / 100).toFixed(2)}
      Total Credits: $${(totalCreditsCents / 100).toFixed(2)}
      Total Debits: $${(totalDebitsCents / 100).toFixed(2)}
      New Wallet Balance: $${(newWalletCents / 100).toFixed(2)}
      Current Month Usage: $${(currentMonthUsageCents / 100).toFixed(2)}
    `);

    // 5. Update Billing Account
    const { error: updateError } = await supabase
      .from("billing_accounts")
      .update({
        month_spent_cents: currentMonthUsageCents,
        wallet_cents: newWalletCents,
      })
      .eq("user_id", userId);

    if (updateError) throw updateError;

    return new Response(
      JSON.stringify({
        success: true,
        totalCostCents: currentMonthUsageCents, // Return current month for compatibility
        totalCostDollars: (currentMonthUsageCents / 100).toFixed(2),
        walletBalanceDollars: (newWalletCents / 100).toFixed(2),
        callsCount: calls?.length || 0,
        message: `Billing balance synced. Wallet: $${(newWalletCents / 100).toFixed(2)}, Month: $${(currentMonthUsageCents / 100).toFixed(2)}`,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in sync-billing-balance:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
        details: error,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
