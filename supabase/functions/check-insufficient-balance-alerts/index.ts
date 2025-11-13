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

      const walletBalanceFormatted = formatCurrency(account.wallet_cents);
      const monthSpentFormatted = formatCurrency(account.month_spent_cents);
      const shortfallFormatted = formatCurrency(account.month_spent_cents - account.wallet_cents);

      const html = `<!doctype html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml">
<head>
  <meta charset="utf-8">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Insufficient Balance Alert</title>
  <style>
    a { text-decoration: none; }
    .hover-underline:hover { text-decoration: underline !important; }
    @media (max-width: 600px) {
      .container { width: 100% !important; }
      .px-24 { padding-left: 16px !important; padding-right: 16px !important; }
      .py-32 { padding-top: 24px !important; padding-bottom: 24px !important; }
      .btn { width: 100% !important; }
    }
  </style>
</head>
<body style="margin:0; padding:0; background:#0b1220;">
  <div style="display:none; overflow:hidden; line-height:1px; opacity:0; max-height:0; max-width:0;">
    Insufficient balance: costs exceeded wallet funds. Top up to resume Voice AI Dash.
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b1220;">
    <tr>
      <td align="center" class="px-24" style="padding:24px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" class="container" style="width:600px; background:#0f172a; border-radius:16px; overflow:hidden; box-shadow:0 10px 30px rgba(0,0,0,0.35);">
          <tr>
            <td align="center" style="padding:28px 24px 8px 24px; background:#0b1220;">
              <a href="https://voiceaidash.com" target="_blank" rel="noopener">
                <img src="https://voiceaidash.com/assets/Voice%20AI%20Dash%20Logo%20with%20Text%20Dark-Di3zKMgu.png" alt="Voice AI Dash" width="180" style="display:block; border:0; outline:0; text-decoration:none;">
              </a>
            </td>
          </tr>
          <tr>
            <td class="py-32 px-24" style="padding:32px 32px 0 32px;">
              <h1 style="margin:0; font-family:Inter,Segoe UI,Roboto,Arial,sans-serif; font-size:24px; line-height:32px; color:#ffffff;">
                Insufficient Balance Alert
              </h1>
              <p style="margin:12px 0 0 0; font-family:Inter,Segoe UI,Roboto,Arial,sans-serif; font-size:15px; line-height:24px; color:#cbd5e1;">
                Hi ${user.first_name}, recent service costs exceeded your available wallet funds. Add credits to ensure uninterrupted service.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 0 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:separate; background:#0b1220; border:1px solid #1f2937; border-radius:12px;">
                <tr>
                  <td style="padding:14px 16px; font-family:Inter,Segoe UI,Roboto,Arial,sans-serif; font-size:14px; color:#cbd5e1;">Current wallet balance</td>
                  <td align="right" style="padding:14px 16px; font-family:Inter,Segoe UI,Roboto,Arial,sans-serif; font-size:14px; color:#ffffff;"><strong>${walletBalanceFormatted}</strong></td>
                </tr>
                <tr>
                  <td style="padding:14px 16px; font-family:Inter,Segoe UI,Roboto,Arial,sans-serif; font-size:14px; color:#cbd5e1;">Month-to-date spend</td>
                  <td align="right" style="padding:14px 16px; font-family:Inter,Segoe UI,Roboto,Arial,sans-serif; font-size:14px; color:#ffffff;"><strong>${monthSpentFormatted}</strong></td>
                </tr>
                <tr>
                  <td style="padding:14px 16px; font-family:Inter,Segoe UI,Roboto,Arial,sans-serif; font-size:14px; color:#cbd5e1;">Amount needed to cover shortfall</td>
                  <td align="right" style="padding:14px 16px; font-family:Inter,Segoe UI,Roboto,Arial,sans-serif; font-size:14px; color:#fca5a5;"><strong>${shortfallFormatted}</strong></td>
                </tr>
              </table>
              <p style="margin:12px 0 0 0; font-family:Inter,Segoe UI,Roboto,Arial,sans-serif; font-size:12px; line-height:20px; color:#94a3b8;">
                If the invoice total is not paid in full when issued, service may be suspended until the balance is cleared.
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:20px 32px 8px 32px;">
              <a href="https://voiceaidash.com/" class="btn"
                 style="display:inline-block; background:#2563eb; color:#ffffff; font-family:Inter,Segoe UI,Roboto,Arial,sans-serif; font-size:16px; font-weight:600; line-height:44px; padding:0 24px; border-radius:12px; text-align:center; min-width:220px;">
                Top Up Your Wallet
              </a>
              <div style="height:8px; line-height:8px;">&nbsp;</div>
              <p style="margin:8px 0 0 0; font-family:Inter,Segoe UI,Roboto,Arial,sans-serif; font-size:12px; line-height:18px; color:#94a3b8;">
                If the button does not work, use this link:
                <br>
                <a href="https://voiceaidash.com/" style="color:#93c5fd;" class="hover-underline">https://voiceaidash.com/</a>
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:20px 24px 28px 24px; background:#0b1220;">
              <p style="margin:0; font-family:Inter,Segoe UI,Roboto,Arial,sans-serif; font-size:12px; line-height:18px; color:#64748b;">
                © <span style="white-space:nowrap;">Voice AI Dash</span>
              </p>
              <p style="margin:6px 0 0 0; font-family:Inter,Segoe UI,Roboto,Arial,sans-serif; font-size:12px; line-height:18px; color:#64748b;">
                Need help? Contact support at
                <a href="mailto:support@smartcompanyai.com" style="color:#93c5fd; text-decoration:none;">support@smartcompanyai.com</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

      const emailPayload = {
        to: user.email,
        subject: 'Insufficient Balance - Action Required',
        userId: user.id,
        emailType: 'insufficient_balance_alert',
        html: html,
      };

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
