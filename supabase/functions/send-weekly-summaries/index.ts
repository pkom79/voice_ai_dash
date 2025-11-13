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
  email: string;
  notification_preferences: any;
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

function generateWeeklySummaryEmail(
  user: User,
  stats: CallStats,
  startDate: string,
  endDate: string
): string {
  const avgDuration = stats.total_calls > 0 ? Math.round(stats.total_duration_seconds / stats.total_calls) : 0;
  const avgCost = stats.total_calls > 0 ? Math.round(stats.total_cost_cents / stats.total_calls) : 0;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #2563eb; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background-color: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
        .stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin: 20px 0; }
        .stat-card { background-color: white; padding: 20px; border-radius: 8px; text-align: center; border: 1px solid #e5e7eb; }
        .stat-label { font-size: 14px; color: #6b7280; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px; }
        .stat-value { font-size: 28px; font-weight: bold; color: #111827; }
        .stat-small { font-size: 20px; }
        .breakdown { background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #e5e7eb; }
        .breakdown-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e5e7eb; }
        .breakdown-row:last-child { border-bottom: none; }
        .breakdown-label { color: #6b7280; }
        .breakdown-value { font-weight: bold; color: #111827; }
        .highlight { background-color: #dbeafe; padding: 15px; border-radius: 6px; margin: 20px 0; }
        .footer { text-align: center; color: #6b7280; font-size: 14px; margin-top: 30px; }
        .date-range { background-color: #f3f4f6; padding: 10px; border-radius: 6px; text-align: center; margin-bottom: 20px; font-size: 14px; color: #4b5563; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>📊 Weekly Call Summary</h1>
        </div>
        <div class="content">
          <p>Hi ${user.first_name},</p>

          <p>Here's your call activity summary for the past 7 days:</p>

          <div class="date-range">
            ${new Date(startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} -
            ${new Date(endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </div>

          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-label">Total Calls</div>
              <div class="stat-value">${stats.total_calls}</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Total Cost</div>
              <div class="stat-value stat-small">${formatCurrency(stats.total_cost_cents)}</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Total Duration</div>
              <div class="stat-value stat-small">${formatDuration(stats.total_duration_seconds)}</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Actions Triggered</div>
              <div class="stat-value">${stats.actions_triggered}</div>
            </div>
          </div>

          <div class="breakdown">
            <h3 style="margin-top: 0; color: #111827;">Call Breakdown</h3>
            <div class="breakdown-row">
              <span class="breakdown-label">Inbound Calls</span>
              <span class="breakdown-value">${stats.inbound_calls} (${stats.total_calls > 0 ? Math.round((stats.inbound_calls / stats.total_calls) * 100) : 0}%)</span>
            </div>
            <div class="breakdown-row">
              <span class="breakdown-label">Outbound Calls</span>
              <span class="breakdown-value">${stats.outbound_calls} (${stats.total_calls > 0 ? Math.round((stats.outbound_calls / stats.total_calls) * 100) : 0}%)</span>
            </div>
            <div class="breakdown-row">
              <span class="breakdown-label">Average Duration</span>
              <span class="breakdown-value">${formatDuration(avgDuration)}</span>
            </div>
            <div class="breakdown-row">
              <span class="breakdown-label">Average Cost per Call</span>
              <span class="breakdown-value">${formatCurrency(avgCost)}</span>
            </div>
          </div>

          <div class="highlight">
            <p style="margin: 0;">💡 <strong>Tip:</strong> View detailed call logs and analytics in your dashboard for deeper insights into your call performance.</p>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <a href="https://voiceaidash.com/dashboard" style="display: inline-block; background-color: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px;">View Dashboard</a>
          </div>

          <div class="footer">
            <p>Voice AI Dash - Voice Agent Management Platform</p>
            <p>You're receiving this weekly summary because you have weekly summaries enabled in your notification preferences.</p>
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
    const templateId = Deno.env.get('RESEND_TEMPLATE_WEEKLY_SUMMARY');

    const endDate = new Date();
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 7);

    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, first_name, last_name, email, notification_preferences')
      .returns<User[]>();

    if (usersError) throw usersError;

    const summariesSent = [];

    for (const user of users || []) {
      const prefs = user.notification_preferences || {};
      if (prefs.weekly_summaries !== true) {
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

      const emailPayload = {
        to: user.email,
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
        await supabase.rpc('update_last_alert_timestamp', {
          p_user_id: user.id,
          p_alert_type: 'weekly_summary',
        });

        summariesSent.push({
          userId: user.id,
          email: user.email,
          totalCalls: stats.total_calls,
          totalCost: formatCurrency(stats.total_cost_cents),
        });
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
