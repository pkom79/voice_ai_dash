import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ConnectionIssue {
  user_id: string;
  first_name: string;
  last_name: string;
  business_name: string | null;
  location_name: string | null;
  issue_type: 'expired_token' | 'integration_error' | 'disconnected' | 'broken';
  details: string;
  timestamp: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    
    // Try to get the key from the environment, or fallback to the incoming request header
    let supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SERVICE_ROLE_KEY");
    
    const authHeader = req.headers.get("Authorization");
    if (!supabaseServiceKey && authHeader && authHeader.startsWith("Bearer ")) {
      supabaseServiceKey = authHeader.replace("Bearer ", "");
      console.log("Using Service Key from Authorization header");
    }

    if (!supabaseServiceKey) {
      console.error("FATAL: Service Role Key is missing in environment variables and request headers");
      throw new Error("Service Role Key missing");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body for force flag
    const { force = false } = await req.json().catch(() => ({}));

    console.log(`Checking for connection health issues... (Force: ${force})`);
    console.log(`Using Supabase URL: ${supabaseUrl}`);
    console.log(`Service Key present: ${!!supabaseServiceKey}`);

    const now = new Date().toISOString();
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const issues: ConnectionIssue[] = [];

    // 1. Check for expired tokens, disconnected users, or broken states
    const { data: problematicConnections, error: queryError } = await supabase
      .from("api_keys")
      .select(`
        id,
        user_id,
        token_expires_at,
        location_name,
        is_active,
        access_token,
        users!api_keys_user_id_fkey!inner(
          first_name,
          last_name,
          business_name
        )
      `)
      .eq("service", "highlevel")
      .or(`token_expires_at.lt.${now},is_active.eq.false,access_token.is.null`)
      .order("token_expires_at", { ascending: true });

    if (queryError) {
      console.error("Error querying problematic connections:", queryError);
    } else if (problematicConnections && problematicConnections.length > 0) {
      console.log(`Found ${problematicConnections.length} problematic connections`);

      // Mark inactive connections as expired if not already
      const connectionsToMarkExpired = problematicConnections.filter((c: any) => !c.is_active && !c.expired_at);
      if (connectionsToMarkExpired.length > 0) {
        const idsToUpdate = connectionsToMarkExpired.map((c: any) => c.id);
        const { error: updateError } = await supabase
          .from("api_keys")
          .update({ expired_at: now })
          .in("id", idsToUpdate)
          .is("expired_at", null);

        if (updateError) console.error("Error marking connections as expired:", updateError);
      }

      problematicConnections.forEach((conn: any) => {
        let issueType: 'expired_token' | 'disconnected' | 'broken' = 'expired_token';
        let details = '';

        if (!conn.is_active) {
          issueType = 'disconnected';
          details = 'Connection is marked as inactive';
        } else if (!conn.access_token) {
          issueType = 'broken';
          details = 'Access token is missing';
        } else {
          issueType = 'expired_token';
          details = `Token expired on ${new Date(conn.token_expires_at).toLocaleString()}`;
        }

        issues.push({
          user_id: conn.user_id,
          first_name: conn.users.first_name,
          last_name: conn.users.last_name,
          business_name: conn.users.business_name,
          location_name: conn.location_name,
          issue_type: issueType as any,
          details: details,
          timestamp: conn.token_expires_at || now
        });
      });
    }    // 2. Check for recent integration errors (last 24h, unresolved)
    const { data: errorConnections, error: errorQueryError } = await supabase
      .from("user_integration_errors")
      .select(`
        user_id,
        error_message,
        created_at,
        users!inner(
          first_name,
          last_name,
          business_name
        )
      `)
      .eq("error_source", "highlevel")
      .eq("resolved", false)
      .gte("created_at", oneDayAgo)
      .order("created_at", { ascending: false });

    if (errorQueryError) {
      console.error("Error querying integration errors:", errorQueryError);
    } else if (errorConnections && errorConnections.length > 0) {
      console.log(`Found ${errorConnections.length} recent integration errors`);

      errorConnections.forEach((err: any) => {
        if (!issues.find(i => i.user_id === err.user_id && i.issue_type === 'expired_token')) {
          if (!issues.find(i => i.user_id === err.user_id && i.issue_type === 'integration_error')) {
            issues.push({
              user_id: err.user_id,
              first_name: err.users.first_name,
              last_name: err.users.last_name,
              business_name: err.users.business_name,
              location_name: "Unknown (Error Log)",
              issue_type: 'integration_error',
              details: `Error: ${err.error_message}`,
              timestamp: err.created_at
            });
          }
        }
      });
    }

    if (issues.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No connection issues found",
          issueCount: 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get admin emails
    const { data: admins } = await supabase
      .from("users")
      .select("id")
      .eq("role", "admin")
      .eq("is_active", true);

    if (!admins || admins.length === 0) {
      throw new Error("No admin users found");
    }

    const adminIds = admins.map((a: any) => a.id);
    const { data: adminEmailRows } = await supabase
      .from("user_notification_emails")
      .select("email")
      .in("user_id", adminIds)
      .eq("admin_token_expired", true)
      .eq("is_primary", true);

    const adminEmails: string[] = (adminEmailRows || []).map((row: any) => row.email).filter(Boolean);

    if (adminEmails.length === 0) {
      throw new Error("No admin email addresses found");
    }

    // Check recent notifications
    const { data: recentNotifications } = await supabase
      .from("admin_notifications")
      .select("user_id")
      .eq("notification_type", "token_expired")
      .gte("sent_at", oneDayAgo);

    const recentlyNotifiedUserIds = new Set(recentNotifications?.map((n: any) => n.user_id) || []);

    const issuesToNotify = force 
      ? issues 
      : issues.filter(issue => !recentlyNotifiedUserIds.has(issue.user_id));

    if (issuesToNotify.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "All issues already notified recently",
          issueCount: issues.length,
          notifiedCount: 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build email content
    const emailHtml = `
      <h2>HighLevel Connection Health Alert</h2>
      <p>The following user(s) have connection issues (expired tokens or integration errors) that need attention:</p>
      <table border="1" cellpadding="10" cellspacing="0" style="border-collapse: collapse; width: 100%;">
        <thead>
          <tr style="background-color: #f3f4f6;">
            <th>User</th>
            <th>Business Name</th>
            <th>Issue Type</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          ${issuesToNotify
        .map(
          (issue) => `
            <tr>
              <td>${issue.first_name} ${issue.last_name}</td>
              <td>${issue.business_name || "N/A"}</td>
              <td><span style="padding: 4px 8px; border-radius: 4px; background-color: ${issue.issue_type === 'expired_token' ? '#fee2e2; color: #991b1b' : '#fef3c7; color: #92400e'}">${issue.issue_type === 'expired_token' ? 'Expired Token' : 'Integration Error'}</span></td>
              <td>${issue.details}</td>
            </tr>
          `
        )
        .join("")}
        </tbody>
      </table>
      <p style="margin-top: 20px;">
        <strong>Action Required:</strong> Please check the admin panel to resolve these issues.
      </p>
    `;

    // Send emails
    let emailsSent = 0;
    const emailErrors: any[] = [];
    const resendApiKey = Deno.env.get('RESEND_API_KEY');

    for (const adminEmail of adminEmails) {
      try {
        // Strategy 1: Direct Resend API call (Preferred/Faster)
        if (resendApiKey) {
          console.log(`Sending email to ${adminEmail} via direct Resend API...`);
          const resendResponse = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${resendApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: 'Voice AI Dash <no-reply@notifications.voiceaidash.app>',
              to: [adminEmail],
              subject: `Connection Health Alert - ${issuesToNotify.length} User(s) Need Attention`,
              html: emailHtml,
            }),
          });

          if (resendResponse.ok) {
            console.log(`Email sent successfully to ${adminEmail} (Direct)`);
            emailsSent++;
            continue; // Skip fallback
          } else {
            const errorText = await resendResponse.text();
            console.error(`Direct Resend failed: ${errorText}. Falling back to send-email function...`);
          }
        }

        // Strategy 2: Inter-function call (Fallback)
        console.log(`Attempting to send email to ${adminEmail} via send-email function...`);
        console.log(`Using Auth Key Prefix: ${supabaseServiceKey.substring(0, 10)}...`);
        
        const emailResponse = await fetch(
          `${supabaseUrl}/functions/v1/send-email`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({
              to: adminEmail,
              subject: `Connection Health Alert - ${issuesToNotify.length} User(s) Need Attention`,
              html: emailHtml,
              userId: issuesToNotify[0]?.user_id ?? "",
              emailType: "admin_token_expired",
            }),
          }
        );

        if (emailResponse.ok) {
          console.log(`Email sent successfully to ${adminEmail} (Function)`);
          emailsSent++;
        } else {
          const errorText = await emailResponse.text();
          console.error(`Failed to send email to ${adminEmail}. Status: ${emailResponse.status}. Response: ${errorText}`);
          emailErrors.push({ 
            email: adminEmail, 
            status: emailResponse.status, 
            error: errorText,
            key_prefix: supabaseServiceKey.substring(0, 5) + '...'
          });
        }
      } catch (error) {
        console.error(`Error sending email to ${adminEmail}:`, error);
        emailErrors.push({ email: adminEmail, error: error instanceof Error ? error.message : String(error) });
      }
    }

    // Record notifications
    const notificationRecords = issuesToNotify.flatMap((issue) =>
      adminEmails.map((email) => ({
        notification_type: "token_expired",
        user_id: issue.user_id,
        recipient_email: email,
        subject: `Connection Health Alert - ${issuesToNotify.length} User(s) Need Attention`,
        metadata: {
          business_name: issue.business_name,
          issue_type: issue.issue_type,
          details: issue.details,
        },
      }))
    );

    await supabase.from("admin_notifications").insert(notificationRecords);

    return new Response(
      JSON.stringify({
        success: true,
        issueCount: issues.length,
        notifiedCount: issuesToNotify.length,
        emailsSent,
        emailErrors: emailErrors.length > 0 ? emailErrors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in check-expired-tokens function:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
