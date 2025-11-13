import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
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
    const templateId = Deno.env.get('RESEND_TEMPLATE_DAILY_SUMMARY') || 'daily-activity-summary';

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

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
        .select('direction, duration_seconds, cost_cents, status, created_at')
        .eq('user_id', user.id)
        .gte('created_at', yesterday.toISOString())
        .lt('created_at', today.toISOString());

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
      const completedCalls = calls?.filter(c => c.status === 'completed').length || 0;
      const totalDurationSeconds = calls?.reduce((sum, c) => sum + (c.duration_seconds || 0), 0) || 0;
      const totalCostCents = calls?.reduce((sum, c) => sum + (c.cost_cents || 0), 0) || 0;

      const templateData = {
        user: {
          first_name: user.first_name,
          last_name: user.last_name,
        },
        date: yesterday.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        }),
        total_calls: totalCalls,
        inbound_calls: inboundCalls,
        outbound_calls: outboundCalls,
        completed_calls: completedCalls,
        total_duration: formatDuration(totalDurationSeconds),
        total_duration_seconds: totalDurationSeconds,
        total_cost: formatCurrency(totalCostCents),
        total_cost_cents: totalCostCents,
        average_call_duration: totalCalls > 0 ? formatDuration(Math.floor(totalDurationSeconds / totalCalls)) : '0s',
        completion_rate: totalCalls > 0 ? Math.round((completedCalls / totalCalls) * 100) : 0,
      };

      for (const notifEmail of notificationEmails) {
        const emailPayload = {
          to: notifEmail.email,
          subject: `Daily Activity Summary - ${yesterday.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
          userId: user.id,
          emailType: 'daily_summary',
          templateId: templateId,
          templateData,
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
            totalCost: formatCurrency(totalCostCents),
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