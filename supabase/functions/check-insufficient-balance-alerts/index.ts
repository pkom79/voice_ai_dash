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
  month_spent_cents: number;
  last_insufficient_balance_alert_at: string | null;
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

function generateInsufficientBalanceEmail(
  user: User,
  walletCents: number,
  monthSpentCents: number
): string {
  const shortfall = monthSpentCents - walletCents;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #dc2626; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background-color: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
        .alert-box { background-color: #fee2e2; border-left: 4px solid #dc2626; padding: 15px; margin: 20px 0; border-radius: 4px; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin: 20px 0; }
        .info-card { background-color: white; padding: 15px; border-radius: 6px; border: 1px solid #e5e7eb; }
        .info-label { font-size: 14px; color: #6b7280; margin-bottom: 5px; }
        .info-value { font-size: 24px; font-weight: bold; color: #111827; }
        .shortfall { color: #dc2626; }
        .button { display: inline-block; background-color: #dc2626; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
        .footer { text-align: center; color: #6b7280; font-size: 14px; margin-top: 30px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🚨 Insufficient Balance Alert</h1>
        </div>
        <div class="content">
          <p>Hi ${user.first_name},</p>

          <div class="alert-box">
            <strong>⚠️ Your wallet balance cannot cover your upcoming monthly invoice</strong>
          </div>

          <p>Your monthly usage charges exceed your current wallet balance. Here's a breakdown:</p>

          <div class="info-grid">
            <div class="info-card">
              <div class="info-label">Current Month Usage</div>
              <div class="info-value">${formatCurrency(monthSpentCents)}</div>
            </div>
            <div class="info-card">
              <div class="info-label">Wallet Balance</div>
              <div class="info-value">${formatCurrency(walletCents)}</div>
            </div>
          </div>

          <div class="alert-box">
            <p style="margin: 0;"><strong>Shortfall: <span class="shortfall">${formatCurrency(shortfall)}</span></strong></p>
          </div>

          <p>Your invoice will be processed on the 1st of the month. To ensure uninterrupted service, please add funds to your wallet before then.</p>

          <a href="https://voiceaidash.com/billing" class="button">Add Funds Now</a>

          <p style="margin-top: 30px;"><strong>What happens if I don't add funds?</strong></p>
          <p>If your wallet cannot cover the invoice amount, the payment will fail and your service may be suspended until the balance is resolved.</p>

          <div class="footer">
            <p>Voice AI Dash - Voice Agent Management Platform</p>
            <p>You're receiving this email because you have insufficient balance alerts enabled in your notification preferences.</p>
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
    const templateId = Deno.env.get('RESEND_TEMPLATE_INSUFFICIENT_BALANCE');

    const now = new Date();

    const { data: billingAccounts, error: billingError } = await supabase
      .from('billing_accounts')
      .select('user_id, billing_plan, wallet_cents, month_spent_cents, last_insufficient_balance_alert_at')
      .eq('billing_plan', 'pay_per_use')
      .returns<BillingAccount[]>();

    if (billingError) throw billingError;

    const alertsSent = [];

    for (const account of billingAccounts || []) {
      if (account.month_spent_cents <= account.wallet_cents) {
        continue;
      }

      if (account.last_insufficient_balance_alert_at) {
        const lastAlert = new Date(account.last_insufficient_balance_alert_at);
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
      if (prefs.insufficient_balance_alerts !== true) {
        continue;
      }

      const templateData = {
        wallet_cents: account.wallet_cents,
        month_spent_cents: account.month_spent_cents,
        shortfall_cents: account.month_spent_cents - account.wallet_cents,
        wallet_balance_formatted: formatCurrency(account.wallet_cents),
        month_spent_formatted: formatCurrency(account.month_spent_cents),
        shortfall_formatted: formatCurrency(account.month_spent_cents - account.wallet_cents),
        user: {
          first_name: user.first_name,
          last_name: user.last_name,
          email: user.email,
        },
      };

      const emailPayload: any = {
        to: user.email,
        subject: 'Insufficient Balance - Action Required',
        userId: user.id,
        emailType: 'insufficient_balance_alert',
        templateData,
      };

      if (templateId) {
        emailPayload.templateId = templateId;
      } else {
        emailPayload.html = generateInsufficientBalanceEmail(
          user,
          account.wallet_cents,
          account.month_spent_cents
        );
      }

      const emailResponse = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(emailPayload),
      });

      if (emailResponse.ok) {
        await supabase.rpc('update_last_alert_timestamp', {
          p_user_id: user.id,
          p_alert_type: 'insufficient_balance',
        });

        alertsSent.push({
          userId: user.id,
          email: user.email,
          walletBalance: formatCurrency(account.wallet_cents),
          monthSpent: formatCurrency(account.month_spent_cents),
          shortfall: formatCurrency(account.month_spent_cents - account.wallet_cents),
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
    console.error('Error checking insufficient balance alerts:', error);

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
