import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface BillingAccount {
  user_id: string;
  inbound_plan: string | null;
  outbound_plan: string | null;
  wallet_cents: number;
  low_balance_threshold_cents: number;
  last_low_balance_alert_at: string | null;
}

interface User {
  id: string;
  first_name: string;
  last_name: string;
}

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
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
    const supabaseServiceKey =
      Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseServiceKey) {
      throw new Error('Service role key not configured');
    }
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: billingAccounts, error: billingError } = await supabase
      .from('billing_accounts')
      .select('user_id, inbound_plan, outbound_plan, wallet_cents, low_balance_threshold_cents, last_low_balance_alert_at')
      .or('inbound_plan.eq.inbound_pay_per_use,outbound_plan.eq.outbound_pay_per_use')
      .returns<BillingAccount[]>();

    if (billingError) throw billingError;

    const alertsSent: any[] = [];
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
        .select('id, first_name, last_name')
        .eq('id', account.user_id)
        .maybeSingle<User>();

      if (userError || !user) continue;

      const { data: notificationEmails, error: emailsError } = await supabase
        .from('user_notification_emails')
        .select('email, low_balance_enabled')
        .eq('user_id', user.id)
        .eq('low_balance_enabled', true);

      if (emailsError || !notificationEmails || notificationEmails.length === 0) {
        continue;
      }

      const walletBalanceFormatted = formatCurrency(account.wallet_cents);
      const html = renderLowBalanceAlert({
        firstName: user.first_name || "",
        walletBalanceFormatted,
      });

      for (const notifEmail of notificationEmails) {
        const emailPayload = {
          to: notifEmail.email,
          subject: 'Low Balance Alert',
          userId: user.id,
          emailType: 'low_balance_alert',
          html,
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
          alertsSent.push({
            userId: user.id,
            email: notifEmail.email,
            walletBalance: formatCurrency(account.wallet_cents),
          });
        }
      }

      await supabase.rpc('update_last_alert_timestamp', {
        p_user_id: user.id,
        p_alert_type: 'low_balance',
      });
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
  } catch (error: any) {
    console.error('Error sending low balance alerts:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to send low balance alerts',
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

function renderLowBalanceAlert({
  firstName,
  walletBalanceFormatted,
}: {
  firstName: string;
  walletBalanceFormatted: string;
}): string {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html dir="ltr" lang="en">
  <head>
    <meta content="width=device-width" name="viewport" />
    <link rel="preload" as="image" href="https://www.voiceaidash.app/Voice%20AI%20Dash%20Logo%20with%20Text%20Dark.png" />
    <meta content="text/html; charset=UTF-8" http-equiv="Content-Type" />
    <meta name="x-apple-disable-message-reformatting" />
    <meta content="IE=edge" http-equiv="X-UA-Compatible" />
    <meta name="x-apple-disable-message-reformatting" />
    <meta content="telephone=no,address=no,email=no,date=no,url=no" name="format-detection" />
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
  <body>
    <div style="display:none;overflow:hidden;line-height:1px;opacity:0;max-height:0;max-width:0" data-skip-in-text="true">
      Top up your Voice AI Dash wallet to keep your service running smoothly.
    </div>
    <table border="0" width="100%" cellpadding="0" cellspacing="0" role="presentation" align="center">
      <tbody>
        <tr>
          <td>
            <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
              <tbody>
                <tr>
                  <td>
                    <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width:100%">
                      <tbody>
                        <tr>
                          <td>
                            <div style="margin:0;padding:0;background:#0b1220">
                              <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="margin:0;padding:0;background:#0b1220">
                                <tbody>
                                  <tr>
                                    <td>
                                      <tr style="margin:0;padding:0">
                                        <td class="px-24" align="center" data-id="__react-email-column" style="margin:0;padding:24px">
                                          <table width="600" border="0" cellpadding="0" cellspacing="0" role="presentation" class="container" style="margin:0;padding:0;width:600px;background:#0f172a;border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,0.35)">
                                            <tbody>
                                              <tr>
                                                <td>
                                                  <tr style="margin:0;padding:0">
                                                    <td align="center" data-id="__react-email-column" style="margin:0;padding:28px 24px 8px 24px;background:#0b1220">
                                                      <img alt="Voice AI Dash" src="https://www.voiceaidash.app/Voice%20AI%20Dash%20Logo%20with%20Text%20Dark.png" style="display:block;outline:0;border:0;text-decoration:none" width="180" />
                                                    </td>
                                                  </tr>
                                                  <tr style="margin:0;padding:0">
                                                    <td class="py-32 px-24" data-id="__react-email-column" style="margin:0;padding:32px 32px 0 32px">
                                                      <h1 style="margin:0;padding:0;font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;font-size:24px;line-height:32px;color:#ffffff">
                                                        <span>Low Balance Alert</span>
                                                      </h1>
                                                      <p style="margin:12px 0 0 0;padding:0;font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;font-size:15px;line-height:24px;color:#cbd5e1">
                                                        <span>Hi ${firstName}, your wallet balance is below </span><span><strong>$10</strong></span><span>.</span>
                                                      </p>
                                                      <p style="margin:8px 0 0 0;padding:0;font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;font-size:14px;line-height:22px;color:#cbd5e1">
                                                        <span>Current balance: </span><span style="color:#93c5fd"><strong>${walletBalanceFormatted}</strong></span>
                                                      </p>
                                                    </td>
                                                  </tr>
                                                  <tr style="margin:0;padding:0">
                                                    <td align="center" data-id="__react-email-column" style="margin:0;padding:24px 32px 8px 32px">
                                                      <p style="margin:0;padding:0">
                                                        <span><a href="https://www.voiceaidash.app/" rel="noopener noreferrer nofollow" style="color:#ffffff;text-decoration-line:none;display:inline-block;background:#2563eb;font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;font-size:16px;font-weight:600;line-height:44px;padding:0 24px;border-radius:12px;text-align:center;min-width:200px" target="_blank">Top Up Your Wallet</a></span>
                                                      </p>
                                                      <div style="margin:0;padding:0;height:8px;line-height:8px">
                                                        <p style="margin:0;padding:0"><span> </span></p>
                                                      </div>
                                                      <p style="margin:8px 0 0 0;padding:0;font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;font-size:12px;line-height:18px;color:#94a3b8">
                                                        <span>If the button does not work, use this link: </span><br /><span><a href="https://www.voiceaidash.app/" rel="noopener noreferrer nofollow" style="color:#93c5fd;text-decoration-line:none" target="_blank">https://www.voiceaidash.app/</a></span>
                                                      </p>
                                                    </td>
                                                  </tr>
                                                  <tr style="margin:0;padding:0">
                                                    <td data-id="__react-email-column" style="margin:0;padding:16px 32px 0 32px">
                                                      <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="margin:0;padding:0">
                                                        <tbody>
                                                          <tr>
                                                            <td>
                                                              <tr style="margin:0;padding:0">
                                                                <td data-id="__react-email-column" style="margin:0;padding:0;height:1px;background:#1f2937;line-height:1px;font-size:0"><p style="margin:0;padding:0"><span> </span></p></td>
                                                              </tr>
                                                            </td>
                                                          </tr>
                                                        </tbody>
                                                      </table>
                                                      <p style="margin:16px 0 0 0;padding:0;font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;font-size:12px;line-height:20px;color:#94a3b8">
                                                        <span>Service may pause if the balance reaches $0. Add credits to keep calls and transcripts running without interruption.</span>
                                                      </p>
                                                    </td>
                                                  </tr>
                                                  <tr style="margin:0;padding:0">
                                                    <td align="center" data-id="__react-email-column" style="margin:0;padding:20px 24px 28px 24px;background:#0b1220">
                                                      <p style="margin:0;padding:0;font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;font-size:12px;line-height:18px;color:#64748b">
                                                        <span>© Voice AI Dash</span>
                                                      </p>
                                                      <p style="margin:6px 0 0 0;padding:0;font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;font-size:12px;line-height:18px;color:#64748b">
                                                        <span>Need help? Contact support at </span><span><a href="mailto:support@smartcompanyai.com" rel="noopener noreferrer nofollow" style="color:#93c5fd;text-decoration-line:none;text-decoration:none" target="_blank">support@smartcompanyai.com</a></span>
                                                      </p>
                                                    </td>
                                                  </tr>
                                                </td>
                                              </tr>
                                            </tbody>
                                          </table>
                                        </td>
                                      </tr>
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                            <p style="margin:0;padding:0"><br /></p>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                </tr>
              </tbody>
            </table>
          </td>
        </tr>
      </tbody>
    </table>
  </body>
</html>`;
}
