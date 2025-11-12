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

      const emailHtml = generateWeeklySummaryEmail(
        user,
        stats,
        startDate.toISOString().split('T')[0],
        endDate.toISOString().split('T')[0]
      );

      const emailResponse = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: user.email,
          subject: '📊 Your Weekly Call Summary',
          html: emailHtml,
          userId: user.id,
          emailType: 'weekly_summary',
          templateData: {
            start_date: startDate.toISOString(),
            end_date: endDate.toISOString(),
            ...stats,
            total_cost_formatted: formatCurrency(stats.total_cost_cents),
            avg_cost_formatted: formatCurrency(avgCostCents),
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
