import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';
import { toZonedTime, fromZonedTime } from 'npm:date-fns-tz@3.1.3';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface User {
  id: string;
  first_name: string;
  last_name: string;
  is_active: boolean;
}

interface CallStats {
  total_calls: number;
  inbound_calls: number;
  outbound_calls: number;
  total_duration_seconds: number;
  total_cost_cents: number;
  actions_triggered: number;
}

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function formatDurationMinutes(seconds: number): string {
  const minutes = seconds / 60;
  return minutes.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDateOnly(date: Date, timeZone: string): string {
  return date.toLocaleDateString('en-US', {
    timeZone: timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).split('/').reverse().join('-');
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

    const timeZone = 'America/New_York';
    const now = new Date();
    const zonedNow = toZonedTime(now, timeZone);

    const endDate = new Date(zonedNow);
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 7);

    // Convert back to UTC for query
    const endDateUTC = fromZonedTime(endDate, timeZone);
    const startDateUTC = fromZonedTime(startDate, timeZone);

    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, first_name, last_name, is_active')
      .eq('is_active', true)
      .returns<User[]>();

    if (usersError) throw usersError;

    const summariesSent = [];

    for (const user of users || []) {
      const { data: notificationEmails, error: emailsError } = await supabase
        .from('user_notification_emails')
        .select('email, weekly_summary_enabled')
        .eq('user_id', user.id)
        .eq('weekly_summary_enabled', true);

      if (emailsError || !notificationEmails || notificationEmails.length === 0) {
        continue;
      }

      const { data: calls, error: callsError } = await supabase
        .from('calls')
        .select('direction, duration_seconds, cost, action_triggered')
        .eq('user_id', user.id)
        .gte('call_started_at', startDateUTC.toISOString())
        .lte('call_started_at', endDateUTC.toISOString());

      if (callsError) {
        console.error(`Error fetching calls for user ${user.id}:`, callsError);
        continue;
      }

      const stats: CallStats = {
        total_calls: calls?.length || 0,
        inbound_calls: calls?.filter(c => c.direction === 'inbound').length || 0,
        outbound_calls: calls?.filter(c => c.direction === 'outbound').length || 0,
        total_duration_seconds: calls?.reduce((sum, c) => sum + (c.duration_seconds || 0), 0) || 0,
        total_cost_cents: Math.round((calls?.reduce((sum, c) => sum + (parseFloat(c.cost || '0') * 100), 0) || 0)),
        actions_triggered: calls?.filter(c => c.action_triggered).length || 0,
      };

      const avgCostCents = stats.total_calls > 0 ? Math.round(stats.total_cost_cents / stats.total_calls) : 0;

      if (stats.total_calls === 0) {
        continue;
      }

      const startDateFormatted = formatDateOnly(startDateUTC, timeZone);
      const endDateFormatted = formatDateOnly(endDateUTC, timeZone);
      const totalDurationMinutes = Math.round(stats.total_duration_seconds / 60);

      for (const notificationEmail of notificationEmails) {
        const html = renderWeeklySummary({
          firstName: user.first_name || "",
          startDate: startDateFormatted,
          endDate: endDateFormatted,
          totalCalls: stats.total_calls,
          inboundCalls: stats.inbound_calls,
          outboundCalls: stats.outbound_calls,
          totalDurationMinutes,
        });
        const emailPayload = {
          to: notificationEmail.email,
          subject: 'Weekly Activity Summary',
          userId: user.id,
          emailType: 'weekly_summary',
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
            email: notificationEmail.email,
            totalCalls: stats.total_calls,
            totalCost: formatCurrency(stats.total_cost_cents),
          });
        }
      }

      await supabase.rpc('update_last_alert_timestamp', {
        p_user_id: user.id,
        p_alert_type: 'weekly_summary',
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        summariesSent: summariesSent.length,
        details: summariesSent,
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
    console.error('Error sending weekly summaries:', error);

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

function renderWeeklySummary({
  firstName,
  startDate,
  endDate,
  totalCalls,
  inboundCalls,
  outboundCalls,
  totalDurationMinutes,
}: {
  firstName: string;
  startDate: string;
  endDate: string;
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
      Your Voice AI Dash weekly activity summary from ${startDate} to ${endDate}.
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
                                                        <span>Weekly Summary</span>
                                                      </h1>
                                                      <p style="margin:12px 0 0 0;padding:0;font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;font-size:15px;line-height:24px;color:#cbd5e1">
                                                        <span>Hi ${firstName || ""}, here’s your Voice AI Dash activity summary for </span><span style="color:#93c5fd">${startDate}</span><span> – </span><span style="color:#93c5fd">${endDate}</span><span>.</span>
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
                                                        <span>For a detailed breakdown, visit your Voice AI Dash dashboard.</span>
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
