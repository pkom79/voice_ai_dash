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
  grace_until: string | null;
  next_payment_at: string | null;
  last_interruption_warning_at: string | null;
}

interface User {
  id: string;
  first_name: string;
  last_name: string;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
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

    const now = new Date();
    const nineDaysAgo = new Date(now);
    nineDaysAgo.setDate(nineDaysAgo.getDate() - 9);
    const tenDaysAgo = new Date(now);
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

    const { data: billingAccounts, error: billingError } = await supabase
      .from('billing_accounts')
      .select('user_id, inbound_plan, outbound_plan, grace_until, next_payment_at, last_interruption_warning_at')
      .eq('inbound_plan', 'inbound_unlimited')
      .not('grace_until', 'is', null)
      .lte('grace_until', nineDaysAgo.toISOString())
      .gte('grace_until', tenDaysAgo.toISOString())
      .returns<BillingAccount[]>();

    if (billingError) throw billingError;

    const warningsSent = [];

    for (const account of billingAccounts || []) {
      if (!account.grace_until) continue;

      if (account.last_interruption_warning_at) {
        const lastWarning = new Date(account.last_interruption_warning_at);
        const hoursSinceLastWarning = (now.getTime() - lastWarning.getTime()) / (1000 * 60 * 60);
        if (hoursSinceLastWarning < 24) {
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
        .select('email, service_interruption_enabled')
        .eq('user_id', user.id)
        .eq('service_interruption_enabled', true);

      if (emailsError || !notificationEmails || notificationEmails.length === 0) {
        continue;
      }

      const graceUntilDate = new Date(account.grace_until);
      const suspensionDate = new Date(graceUntilDate);
      suspensionDate.setDate(suspensionDate.getDate() + 10);

      const suspensionDateFormatted = formatDate(suspensionDate.toISOString());
      const html = renderServiceInterruptionWarning({
        firstName: user.first_name || "",
        suspensionDateFormatted,
      });

      for (const notificationEmail of notificationEmails) {
        const emailPayload = {
          to: notificationEmail.email,
          subject: 'Service Interruption Warning',
          userId: user.id,
          emailType: 'service_interruption_warning',
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
          warningsSent.push({
            userId: user.id,
            email: notificationEmail.email,
            graceUntil: formatDate(account.grace_until),
            suspensionDate: formatDate(suspensionDate.toISOString()),
          });
        }
      }

      await supabase.rpc('update_last_alert_timestamp', {
        p_user_id: user.id,
        p_alert_type: 'service_interruption',
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        warningsSent: warningsSent.length,
        details: warningsSent,
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
    console.error('Error checking service interruption warnings:', error);

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

function renderServiceInterruptionWarning({
  firstName,
  suspensionDateFormatted,
}: {
  firstName: string;
  suspensionDateFormatted: string;
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
      Pay your invoice now to keep your service running smoothly.
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
                                                        <span>Service Interruption Warning</span>
                                                      </h1>
                                                      <p style="margin:12px 0 0 0;padding:0;font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;font-size:15px;line-height:24px;color:#cbd5e1">
                                                        <span>${firstName}, your invoice needs to be paid by </span><span><strong>${suspensionDateFormatted}</strong></span><span> to avoid service interruption.</span>
                                                      </p>
                                                    </td>
                                                  </tr>
                                                  <tr style="margin:0;padding:0">
                                                    <td align="center" data-id="__react-email-column" style="margin:0;padding:24px 32px 8px 32px">
                                                      <p style="margin:0;padding:0">
                                                        <span><a href="https://www.voiceaidash.app/" rel="noopener noreferrer nofollow" style="color:#ffffff;text-decoration-line:none;display:inline-block;background:#2563eb;font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;font-size:16px;font-weight:600;line-height:44px;padding:0 24px;border-radius:12px;text-align:center;min-width:200px" target="_blank">Pay Invoice</a></span>
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
