import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';

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
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
        .select('direction, duration_seconds, status, created_at')
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
      const totalDurationSeconds = calls?.reduce((sum, c) => sum + (c.duration_seconds || 0), 0) || 0;
      const totalDurationMinutes = Math.round(totalDurationSeconds / 60);

      const date = yesterday.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

      for (const notifEmail of notificationEmails) {
        const html = `<!doctype html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml">
<head>
  <meta charset="utf-8">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Daily Summary</title>
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
    Your Voice AI Dash daily activity summary for ${date}.
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
                Daily Summary
              </h1>
              <p style="margin:12px 0 0 0; font-family:Inter,Segoe UI,Roboto,Arial,sans-serif; font-size:15px; line-height:24px; color:#cbd5e1;">
                Hi ${user.first_name}, here's your Voice AI Dash activity summary for
                <span style="color:#93c5fd;">${date}</span>.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:separate; background:#0b1220; border:1px solid #1f2937; border-radius:12px;">
                <tr>
                  <td style="padding:14px 16px; font-family:Inter,Segoe UI,Roboto,Arial,sans-serif; font-size:14px; color:#cbd5e1;">Total Calls</td>
                  <td align="right" style="padding:14px 16px; font-family:Inter,Segoe UI,Roboto,Arial,sans-serif; font-size:14px; color:#ffffff;"><strong>${totalCalls}</strong></td>
                </tr>
                <tr>
                  <td style="padding:14px 16px; font-family:Inter,Segoe UI,Roboto,Arial,sans-serif; font-size:14px; color:#cbd5e1;">Inbound Calls</td>
                  <td align="right" style="padding:14px 16px; font-family:Inter,Segoe UI,Roboto,Arial,sans-serif; font-size:14px; color:#ffffff;"><strong>${inboundCalls}</strong></td>
                </tr>
                <tr>
                  <td style="padding:14px 16px; font-family:Inter,Segoe UI,Roboto,Arial,sans-serif; font-size:14px; color:#cbd5e1;">Outbound Calls</td>
                  <td align="right" style="padding:14px 16px; font-family:Inter,Segoe UI,Roboto,Arial,sans-serif; font-size:14px; color:#ffffff;"><strong>${outboundCalls}</strong></td>
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
                For more details, visit your Voice AI Dash dashboard.
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:20px 24px 28px 24px; background:#0b1220;">
              <p style="margin:0; font-family:Inter,Segoe UI,Roboto,Arial,sans-serif; font-size:12px; line-height:18px; color:#64748b;">
                © Voice AI Dash
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
          to: notifEmail.email,
          subject: `Daily Activity Summary - ${yesterday.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
          userId: user.id,
          emailType: 'daily_summary',
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
