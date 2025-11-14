import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';

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

function formatDateOnly(dateString: string): string {
  return dateString.split('T')[0];
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
    const templateId = Deno.env.get('RESEND_TEMPLATE_WEEKLY_SUMMARY');

    const endDate = new Date();
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 7);

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
        .gte('call_started_at', startDate.toISOString())
        .lte('call_started_at', endDate.toISOString());

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

      const startDateFormatted = formatDateOnly(startDate.toISOString());
      const endDateFormatted = formatDateOnly(endDate.toISOString());
      const totalDurationMinutes = Math.round(stats.total_duration_seconds / 60);

      const html = `<!doctype html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml">
<head>
  <meta charset="utf-8">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Weekly Summary</title>
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
    Your Voice AI Dash weekly activity summary from ${startDateFormatted} to ${endDateFormatted}.
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b1220;">
    <tr>
      <td align="center" class="px-24" style="padding:24px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" class="container" style="width:600px; background:#0f172a; border-radius:16px; overflow:hidden; box-shadow:0 10px 30px rgba(0,0,0,0.35);">
          <tr>
            <td align="center" style="padding:28px 24px 8px 24px; background:#0b1220;">
              <a href="https://voiceaidash.com" target="_blank" rel="noopener">
                <img src="https://voiceaidash.com/assets/Voice%20AI%20Dash%20Logo%20with%20Text%20Dark-Di3zKMgu.png" alt="Voice AI Dash" width="180" style="display:block; border:0;">
              </a>
            </td>
          </tr>
          <tr>
            <td class="py-32 px-24" style="padding:32px 32px 0 32px;">
              <h1 style="margin:0; font-family:Inter,Segoe UI,Roboto,Arial,sans-serif; font-size:24px; line-height:32px; color:#ffffff;">
                Weekly Summary
              </h1>
              <p style="margin:12px 0 0 0; font-family:Inter,Segoe UI,Roboto,Arial,sans-serif; font-size:15px; line-height:24px; color:#cbd5e1;">
                Hi ${user.first_name}, here's your Voice AI Dash activity summary for
                <span style="color:#93c5fd;">${startDateFormatted}</span> – <span style="color:#93c5fd;">${endDateFormatted}</span>.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:separate; background:#0b1220; border:1px solid #1f2937; border-radius:12px;">
                <tr>
                  <td style="padding:14px 16px; font-family:Inter,Segoe UI,Roboto,Arial,sans-serif; font-size:14px; color:#cbd5e1;">Total Calls</td>
                  <td align="right" style="padding:14px 16px; font-family:Inter,Segoe UI,Roboto,Arial,sans-serif; font-size:14px; color:#ffffff;"><strong>${stats.total_calls}</strong></td>
                </tr>
                <tr>
                  <td style="padding:14px 16px; font-family:Inter,Segoe UI,Roboto,Arial,sans-serif; font-size:14px; color:#cbd5e1;">Inbound Calls</td>
                  <td align="right" style="padding:14px 16px; font-family:Inter,Segoe UI,Roboto,Arial,sans-serif; font-size:14px; color:#ffffff;"><strong>${stats.inbound_calls}</strong></td>
                </tr>
                <tr>
                  <td style="padding:14px 16px; font-family:Inter,Segoe UI,Roboto,Arial,sans-serif; font-size:14px; color:#cbd5e1;">Outbound Calls</td>
                  <td align="right" style="padding:14px 16px; font-family:Inter,Segoe UI,Roboto,Arial,sans-serif; font-size:14px; color:#ffffff;"><strong>${stats.outbound_calls}</strong></td>
                </tr>
                <tr>
                  <td style="padding:14px 16px; font-family:Inter,Segoe UI,Roboto,Arial,sans-serif; font-size:14px; color:#cbd5e1;">Total Duration</td>
                  <td align="right" style="padding:14px 16px; font-family:Inter,Segoe UI,Roboto,Arial,sans-serif; font-size:14px; color:#ffffff;"><strong>${totalDurationMinutes} minutes</strong></td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:12px 32px 24px 32px;">
              <a href="https://voiceaidash.com/" class="btn"
                 style="display:inline-block; background:#2563eb; color:#ffffff; font-family:Inter,Segoe UI,Roboto,Arial,sans-serif; font-size:16px; font-weight:600; line-height:44px; padding:0 24px; border-radius:12px; text-align:center; min-width:200px;">
                View Dashboard
              </a>
              <div style="height:8px; line-height:8px;">&nbsp;</div>
              <p style="margin:8px 0 0 0; font-family:Inter,Segoe UI,Roboto,Arial,sans-serif; font-size:12px; line-height:18px; color:#94a3b8;">
                For a detailed breakdown, visit your Voice AI Dash dashboard.
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:20px 24px 28px 24px; background:#0b1220;">
              <p style="margin:0; font-family:Inter,Segoe UI,Roboto,Arial,sans-serif; font-size:12px; line-height:18px; color:#64748b;">
                © Voice AI Dash
              </p>
              <p style="margin:6px 0 0 0; font-family:Inter,Segoe UI,Roboto,Arial,sans-serif; font-size:12px; line-height:18px; color:#64748b;">
                Need help? Contact support at <a href="mailto:support@smartcompanyai.com" style="color:#93c5fd; text-decoration:none;">support@smartcompanyai.com</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

      for (const notificationEmail of notificationEmails) {
        const emailPayload = {
          to: notificationEmail.email,
          subject: 'Your Weekly Call Summary',
          userId: user.id,
          emailType: 'weekly_summary',
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
