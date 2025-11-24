import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';
import { toZonedTime, fromZonedTime } from 'npm:date-fns-tz@3.1.3';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

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

    const timeZone = 'America/New_York';
    const now = new Date();
    const zonedNow = toZonedTime(now, timeZone);

    const yesterday = new Date(zonedNow);
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const today = new Date(zonedNow);
    today.setHours(0, 0, 0, 0);

    // Convert back to UTC for query
    const yesterdayUTC = fromZonedTime(yesterday, timeZone);
    const todayUTC = fromZonedTime(today, timeZone);

    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, first_name, last_name, is_active')
      .eq('is_active', true);

    if (usersError) throw usersError;

    const summariesSent = [];

    for (const user of users || []) {
      const { data: notificationEmails, error: emailsError } = await supabase
        .from('user_notification_emails')
        .select('email, daily_summary_enabled')
        .eq('user_id', user.id)
        .eq('daily_summary_enabled', true);

      if (emailsError || !notificationEmails || notificationEmails.length === 0) {
        continue;
      }

      const { data: calls, error: callsError } = await supabase
        .from('calls')
        .select('direction, duration_seconds, status, call_started_at')
        .eq('user_id', user.id)
        .eq('is_test_call', false)
        .not('from_number', 'is', null)
        .neq('from_number', '')
        .gte('call_started_at', yesterdayUTC.toISOString())
        .lt('call_started_at', todayUTC.toISOString());

      if (callsError) {
        console.error(`Error fetching calls for user ${user.id}:`, callsError);
        continue;
      }

      const totalCalls = calls?.length || 0;

      if (totalCalls === 0) {
        continue;
      }

      const inboundCalls = calls?.filter(c => c.direction === 'inbound').length || 0;
      const outboundCalls = calls?.filter(c => c.direction === 'outbound').length || 0;
      const totalDurationSeconds = calls?.reduce((sum, c) => sum + (c.duration_seconds || 0), 0) || 0;
      const totalDurationMinutes = Math.round(totalDurationSeconds / 60);

      const date = yesterdayUTC.toLocaleDateString('en-US', {
        timeZone: timeZone,
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

      for (const notifEmail of notificationEmails) {
        const html = renderDailySummary({
          firstName: user.first_name || "",
          date,
          totalCalls,
          inboundCalls,
          outboundCalls,
          totalDurationMinutes,
        });

        const emailPayload = {
          to: notifEmail.email,
          subject: "Daily Activity Summary",
          userId: user.id,
          emailType: 'daily_summary',
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
          summariesSent.push({
            userId: user.id,
            email: notifEmail.email,
            totalCalls,
          });
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        summariesSent: summariesSent.length,
        details: summariesSent,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Error sending daily summaries:', error);
    return new Response(
      JSON.stringify({
        error: error.message || 'Failed to send daily summaries',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

function renderDailySummary({
  firstName,
  date,
  totalCalls,
  inboundCalls,
  outboundCalls,
  totalDurationMinutes,
}: {
  firstName: string;
  date: string;
  totalCalls: number;
  inboundCalls: number;
  outboundCalls: number;
  totalDurationMinutes: number;
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
      Check out your Voice AI Dash performance stats for today's calls
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
                                                        <span>Daily Summary</span>
                                                      </h1>
                                                      <p style="margin:12px 0 0 0;padding:0;font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;font-size:15px;line-height:24px;color:#cbd5e1">
                                                        <span>Hi ${firstName || ""}, here’s your Voice AI Dash activity summary for </span><span style="color:#93c5fd">${date}</span><span>.</span>
                                                      </p>
                                                    </td>
                                                  </tr>
                                                  <tr style="margin:0;padding:0">
                                                    <td data-id="__react-email-column" style="margin:0;padding:20px 32px">
                                                      <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="margin:0;padding:0;border-collapse:separate;background:#0b1220;border:1px solid #1f2937;border-radius:12px">
                                                        <tbody>
                                                          <tr>
                                                            <td>
                                                              <tr style="margin:0;padding:0">
                                                                <td data-id="__react-email-column" style="margin:0;padding:14px 16px;font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;font-size:14px;color:#cbd5e1">
                                                                  <p style="margin:0;padding:0"><span>Total Calls</span></p>
                                                                </td>
                                                                <td align="right" data-id="__react-email-column" style="margin:0;padding:14px 16px;font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;font-size:14px;color:#ffffff">
                                                                  <p style="margin:0;padding:0"><span><strong>${totalCalls}</strong></span></p>
                                                                </td>
                                                              </tr>
                                                              <tr style="margin:0;padding:0">
                                                                <td data-id="__react-email-column" style="margin:0;padding:14px 16px;font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;font-size:14px;color:#cbd5e1">
                                                                  <p style="margin:0;padding:0"><span>Inbound Calls</span></p>
                                                                </td>
                                                                <td align="right" data-id="__react-email-column" style="margin:0;padding:14px 16px;font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;font-size:14px;color:#ffffff">
                                                                  <p style="margin:0;padding:0"><span><strong>${inboundCalls}</strong></span></p>
                                                                </td>
                                                              </tr>
                                                              <tr style="margin:0;padding:0">
                                                                <td data-id="__react-email-column" style="margin:0;padding:14px 16px;font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;font-size:14px;color:#cbd5e1">
                                                                  <p style="margin:0;padding:0"><span>Outbound Calls</span></p>
                                                                </td>
                                                                <td align="right" data-id="__react-email-column" style="margin:0;padding:14px 16px;font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;font-size:14px;color:#ffffff">
                                                                  <p style="margin:0;padding:0"><span><strong>${outboundCalls}</strong></span></p>
                                                                </td>
                                                              </tr>
                                                              <tr style="margin:0;padding:0">
                                                                <td data-id="__react-email-column" style="margin:0;padding:14px 16px;font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;font-size:14px;color:#cbd5e1">
                                                                  <p style="margin:0;padding:0"><span>Total Duration</span></p>
                                                                </td>
                                                                <td align="right" data-id="__react-email-column" style="margin:0;padding:14px 16px;font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;font-size:14px;color:#ffffff">
                                                                  <p style="margin:0;padding:0"><span><strong>${totalDurationMinutes} minutes</strong></span></p>
                                                                </td>
                                                              </tr>
                                                            </td>
                                                          </tr>
                                                        </tbody>
                                                      </table>
                                                    </td>
                                                  </tr>
                                                  <tr style="margin:0;padding:0">
                                                    <td align="center" data-id="__react-email-column" style="margin:0;padding:12px 32px 24px 32px">
                                                      <p style="margin:0;padding:0">
                                                        <span><a href="https://www.voiceaidash.app/" rel="noopener noreferrer nofollow" style="color:#ffffff;text-decoration-line:none;display:inline-block;background:#2563eb;font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;font-size:16px;font-weight:600;line-height:44px;padding:0 24px;border-radius:12px;text-align:center;min-width:200px" target="_blank">View Dashboard</a></span>
                                                      </p>
                                                      <div style="margin:0;padding:0;height:8px;line-height:8px">
                                                        <p style="margin:0;padding:0"><span> </span></p>
                                                      </div>
                                                      <p style="margin:8px 0 0 0;padding:0;font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;font-size:12px;line-height:18px;color:#94a3b8">
                                                        <span>For more details, visit your Voice AI Dash dashboard.</span>
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
