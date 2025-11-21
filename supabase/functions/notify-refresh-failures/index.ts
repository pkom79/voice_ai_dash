import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface NotifyFailuresRequest {
  jobRunId?: string;
  hoursAgo?: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    const { jobRunId, hoursAgo = 24 }: NotifyFailuresRequest = await req.json().catch(() => ({}));

    console.log(`Checking for token refresh failures in the last ${hoursAgo} hours`);

    const { data: failures, error: failuresError } = await supabase
      .rpc('get_recent_refresh_failures', { hours_ago: hoursAgo });

    if (failuresError) {
      console.error('Error fetching refresh failures:', failuresError);
      throw failuresError;
    }

    if (!failures || failures.length === 0) {
      console.log('No token refresh failures found - no notification needed');
      return new Response(
        JSON.stringify({
          success: true,
          failuresFound: 0,
          notificationSent: false,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`Found ${failures.length} token refresh failure(s)`);

    const { data: admins, error: adminsError } = await supabase
      .from('users')
      .select('id, email, full_name')
      .eq('role', 'admin')
      .eq('is_active', true);

    if (adminsError || !admins || admins.length === 0) {
      console.error('No admin users found to notify:', adminsError);
      throw new Error('No admin users available for notification');
    }

    const adminIds = admins.map((a) => a.id);
    const { data: adminEmailRows } = await supabase
      .from('user_notification_emails')
      .select('email')
      .in('user_id', adminIds)
      .eq('admin_hl_disconnected', true)
      .eq('is_primary', true);

    const adminEmails = (adminEmailRows || []).map((row: any) => row.email).filter(Boolean);

    if (adminEmails.length === 0) {
      console.log('No admin emails opted in for HL disconnected notifications');
      return new Response(
        JSON.stringify({
          success: true,
          failuresFound: failedUsers.length,
          notificationSent: false,
          emailsSent: 0,
          emailResults: [],
          failedUsers,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`Notifying ${adminEmails.length} admin email(s)`);

    let jobRunDetails = null;
    if (jobRunId) {
      const { data: jobRun } = await supabase
        .from('scheduled_job_runs')
        .select('*')
        .eq('id', jobRunId)
        .single();
      jobRunDetails = jobRun;
    }

    const uniqueUsers = new Map();
    for (const failure of failures) {
      if (!uniqueUsers.has(failure.user_id)) {
        uniqueUsers.set(failure.user_id, {
          userId: failure.user_id,
          userEmail: failure.user_email,
          userName: failure.user_name || failure.user_email,
          errorMessage: failure.error_message,
          failedAt: failure.failed_at,
          failureCount: failure.failure_count,
        });
      }
    }

    const failedUsers = Array.from(uniqueUsers.values());

    const emailSubject = `HighLevel Token Refresh Failures Detected`;

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; }
    .header h1 { margin: 0; font-size: 24px; }
    .content { background: #fff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; }
    .alert-box { background: #fef2f2; border-left: 4px solid #dc2626; padding: 15px; margin: 20px 0; border-radius: 4px; }
    .user-item { background: #f9fafb; padding: 15px; margin: 10px 0; border-radius: 6px; border: 1px solid #e5e7eb; }
    .user-email { font-weight: 600; color: #1f2937; }
    .error-msg { color: #dc2626; font-size: 14px; margin-top: 5px; font-family: monospace; }
    .stats { display: flex; gap: 20px; margin: 20px 0; }
    .stat-box { flex: 1; background: #f3f4f6; padding: 15px; border-radius: 6px; text-align: center; }
    .stat-number { font-size: 32px; font-weight: bold; color: #dc2626; }
    .stat-label { font-size: 14px; color: #6b7280; }
    .footer { background: #f9fafb; padding: 20px; text-align: center; font-size: 14px; color: #6b7280; border-radius: 0 0 8px 8px; }
    .button { display: inline-block; padding: 12px 24px; background: #2563eb; color: white; text-decoration: none; border-radius: 6px; margin-top: 15px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>⚠️ Token Refresh Failures</h1>
      <p style="margin: 10px 0 0 0; opacity: 0.9;">HighLevel OAuth tokens failed to refresh automatically</p>
    </div>

    <div class="content">
      <div class="alert-box">
        <strong>Action Required:</strong> Some HighLevel OAuth tokens could not be refreshed automatically.
        These users may lose access to their call data if not addressed.
      </div>

      <div class="stats">
        <div class="stat-box">
          <div class="stat-number">${failedUsers.length}</div>
          <div class="stat-label">Affected Users</div>
        </div>
        ${jobRunDetails ? `
        <div class="stat-box">
          <div class="stat-number">${jobRunDetails.tokens_checked || 0}</div>
          <div class="stat-label">Tokens Checked</div>
        </div>
        <div class="stat-box">
          <div class="stat-number">${jobRunDetails.tokens_refreshed || 0}</div>
          <div class="stat-label">Successfully Refreshed</div>
        </div>
        ` : ''}
      </div>

      <h3>Failed Users:</h3>
      ${failedUsers.map(user => `
        <div class="user-item">
          <div class="user-email">${user.userName}</div>
          <div style="color: #6b7280; font-size: 14px;">${user.userEmail}</div>
          ${user.failureCount > 1 ? `<div style="color: #dc2626; font-size: 12px; margin-top: 5px;">⚠️ ${user.failureCount} consecutive failures</div>` : ''}
          ${user.errorMessage ? `<div class="error-msg">${user.errorMessage.substring(0, 200)}${user.errorMessage.length > 200 ? '...' : ''}</div>` : ''}
        </div>
      `).join('')}

      <h3>Next Steps:</h3>
      <ol>
        <li>Log in to the admin panel</li>
        <li>Navigate to Admin → Users</li>
        <li>Find the affected user(s)</li>
        <li>Click "Disconnect HighLevel" then "Connect HighLevel"</li>
        <li>Complete the OAuth flow to re-authorize</li>
      </ol>

      <a href="https://www.voiceaidash.app/admin/users" class="button">Go to Admin Panel</a>
    </div>

    <div class="footer">
      <p>This is an automated notification from Voice AI Dashboard.</p>
      <p>Job Run ID: ${jobRunId || 'N/A'}</p>
    </div>
  </div>
</body>
</html>
    `;

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      console.error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured');
      throw new Error('Email service not configured');
    }

    const emailPromises = adminEmails.map(async (adminEmail) => {
      try {
        const emailResponse = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({
            to: adminEmail,
            subject: emailSubject,
            html: emailHtml,
            userId: failedUsers[0]?.userId ?? '',
            emailType: 'admin_hl_disconnected',
          }),
        });

        if (!emailResponse.ok) {
          const errorText = await emailResponse.text();
          console.error(`Failed to send email to ${adminEmail}:`, errorText);
          return { adminEmail, success: false, error: errorText };
        }

        console.log(`Successfully sent notification email to ${adminEmail}`);
        return { adminEmail, success: true };
      } catch (error) {
        console.error(`Exception sending email to ${adminEmail}:`, error);
        return {
          adminEmail,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    });

    const emailResults = await Promise.all(emailPromises);
    const successfulEmails = emailResults.filter(r => r.success).length;

    console.log(`Sent ${successfulEmails}/${adminEmails.length} notification emails`);

    return new Response(
      JSON.stringify({
        success: true,
        failuresFound: failedUsers.length,
        notificationSent: true,
        emailsSent: successfulEmails,
        emailResults,
        failedUsers,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in notify-refresh-failures:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
