import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface BillingAccount {
  user_id: string;
  billing_plan: string;
  wallet_cents: number;
  low_balance_threshold_cents: number;
  last_low_balance_alert_at: string | null;
}

interface User {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  notification_preferences: any;
}

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function generateLowBalanceEmail(user: User, walletCents: number, thresholdCents: number): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #2563eb; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background-color: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
        .alert-box { background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px; }
        .balance { font-size: 32px; font-weight: bold; color: #dc2626; margin: 20px 0; }
        .button { display: inline-block; background-color: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
        .footer { text-align: center; color: #6b7280; font-size: 14px; margin-top: 30px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Low Balance Alert</h1>
        </div>
        <div class="content">
          <p>Hi ${user.first_name},</p>

          <div class="alert-box">
            <strong>⚠️ Your wallet balance is running low</strong>
          </div>

          <p>Your current wallet balance has fallen below your alert threshold:</p>

          <div class="balance">${formatCurrency(walletCents)}</div>

          <p>Alert threshold: <strong>${formatCurrency(thresholdCents)}</strong></p>

          <p>To avoid service interruption, we recommend adding funds to your wallet as soon as possible.</p>

          <a href="https://voiceaidash.com/billing" class="button">Add Funds Now</a>

          <p style="margin-top: 30px;">If you have any questions or need assistance, please don't hesitate to contact our support team.</p>

          <div class="footer">
            <p>Voice AI Dash - Voice Agent Management Platform</p>
            <p>You're receiving this email because you have low balance alerts enabled in your notification preferences.</p>
            <p><a href="https://voiceaidash.com/profile">Manage notification preferences</a></p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: billingAccounts, error: billingError } = await supabase
      .from('billing_accounts')
      .select('user_id, billing_plan, wallet_cents, low_balance_threshold_cents, last_low_balance_alert_at')
      .eq('billing_plan', 'pay_per_use')
      .returns<BillingAccount[]>();

    if (billingError) throw billingError;

    const alertsSent = [];
    const now = new Date();

    for (const account of billingAccounts || []) {
      if (account.wallet_cents >= account.low_balance_threshold_cents) {
        continue;
      }

      if (account.last_low_balance_alert_at) {
        const lastAlert = new Date(account.last_low_balance_alert_at);
        const hoursSinceLastAlert = (now.getTime() - lastAlert.getTime()) / (1000 * 60 * 60);
        if (hoursSinceLastAlert < 24) {
          continue;
        }
      }

      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id, first_name, last_name, email, notification_preferences')
        .eq('id', account.user_id)
        .single<User>();

      if (userError || !user) continue;

      const prefs = user.notification_preferences || {};
      if (prefs.low_balance_alerts !== true) {
        continue;
      }

      const emailHtml = generateLowBalanceEmail(
        user,
        account.wallet_cents,
        account.low_balance_threshold_cents
      );

      const emailResponse = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: user.email,
          subject: '⚠️ Low Wallet Balance Alert',
          html: emailHtml,
          userId: user.id,
          emailType: 'low_balance_alert',
          templateData: {
            wallet_cents: account.wallet_cents,
            low_balance_threshold_cents: account.low_balance_threshold_cents,
            wallet_balance_formatted: formatCurrency(account.wallet_cents),
            threshold_formatted: formatCurrency(account.low_balance_threshold_cents),
            user: {
              first_name: user.first_name,
              last_name: user.last_name,
              email: user.email,
            },
          },
        }),
      });

      if (emailResponse.ok) {
        await supabase.rpc('update_last_alert_timestamp', {
          p_user_id: user.id,
          p_alert_type: 'low_balance',
        });

        alertsSent.push({
          userId: user.id,
          email: user.email,
          walletBalance: formatCurrency(account.wallet_cents),
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        alertsSent: alertsSent.length,
        details: alertsSent,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('Error checking low balance alerts:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});
