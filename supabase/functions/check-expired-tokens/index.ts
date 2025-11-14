import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ExpiredToken {
  user_id: string;
  first_name: string;
  last_name: string;
  business_name: string | null;
  token_expires_at: string;
  location_name: string | null;
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
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("Checking for expired tokens...");

    // Find all connections with expired tokens that are still marked as active
    const now = new Date().toISOString();
    const { data: expiredConnections, error: queryError } = await supabase
      .from("api_keys")
      .select(`
        id,
        user_id,
        token_expires_at,
        location_name,
        is_active,
        users!inner(
          first_name,
          last_name,
          business_name
        )
      `)
      .eq("service", "highlevel")
      .lt("token_expires_at", now)
      .order("token_expires_at", { ascending: true });

    if (queryError) {
      console.error("Error querying expired tokens:", queryError);
      throw queryError;
    }

    console.log(`Found ${expiredConnections?.length || 0} expired/expiring connections`);

    if (!expiredConnections || expiredConnections.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No expired tokens found",
          expiredCount: 0,
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const expiredTokens: ExpiredToken[] = expiredConnections.map((conn: any) => ({
      user_id: conn.user_id,
      first_name: conn.users.first_name,
      last_name: conn.users.last_name,
      business_name: conn.users.business_name,
      token_expires_at: conn.token_expires_at,
      location_name: conn.location_name,
    }));

    // Mark inactive connections as expired
    const connectionsToMarkExpired = expiredConnections.filter((c: any) => !c.is_active);
    if (connectionsToMarkExpired.length > 0) {
      const idsToUpdate = connectionsToMarkExpired.map((c: any) => c.id);
      const { error: updateError } = await supabase
        .from("api_keys")
        .update({
          expired_at: now,
        })
        .in("id", idsToUpdate)
        .is("expired_at", null);

      if (updateError) {
        console.error("Error marking connections as expired:", updateError);
      } else {
        console.log(`Marked ${idsToUpdate.length} connections as expired`);
      }
    }

    // Get admin emails
    const { data: admins, error: adminsError } = await supabase
      .from("users")
      .select("id")
      .eq("role", "admin")
      .eq("is_active", true);

    if (adminsError || !admins || admins.length === 0) {
      console.error("No admin users found:", adminsError);
      return new Response(
        JSON.stringify({
          success: false,
          error: "No admin users found to notify",
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    // Get admin email addresses
    const adminEmails: string[] = [];
    for (const admin of admins) {
      const { data: emails } = await supabase
        .from("user_notification_emails")
        .select("email")
        .eq("user_id", admin.id)
        .eq("is_primary", true)
        .maybeSingle();

      if (emails?.email) {
        adminEmails.push(emails.email);
      }
    }

    if (adminEmails.length === 0) {
      console.error("No admin email addresses found");
      return new Response(
        JSON.stringify({
          success: false,
          error: "No admin email addresses found",
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    // Check if we've already sent a notification recently (within last 24 hours)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recentNotifications } = await supabase
      .from("admin_notifications")
      .select("user_id")
      .eq("notification_type", "token_expired")
      .gte("sent_at", oneDayAgo);

    const recentlyNotifiedUserIds = new Set(
      recentNotifications?.map((n: any) => n.user_id) || []
    );

    // Filter out users we've already notified recently
    const tokensToNotify = expiredTokens.filter(
      (token) => !recentlyNotifiedUserIds.has(token.user_id)
    );

    if (tokensToNotify.length === 0) {
      console.log("All expired tokens were already notified recently");
      return new Response(
        JSON.stringify({
          success: true,
          message: "All expired tokens already notified recently",
          expiredCount: expiredTokens.length,
          notifiedCount: 0,
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    // Build email content
    const emailHtml = `
      <h2>HighLevel Token Expiration Alert</h2>
      <p>The following user(s) have expired HighLevel connection tokens that need to be reconnected:</p>
      <table border="1" cellpadding="10" cellspacing="0" style="border-collapse: collapse; width: 100%;">
        <thead>
          <tr style="background-color: #f3f4f6;">
            <th>User</th>
            <th>Business Name</th>
            <th>Location</th>
            <th>Expired On</th>
          </tr>
        </thead>
        <tbody>
          ${tokensToNotify
            .map(
              (token) => `
            <tr>
              <td>${token.first_name} ${token.last_name}</td>
              <td>${token.business_name || "N/A"}</td>
              <td>${token.location_name || "Unknown"}</td>
              <td>${new Date(token.token_expires_at).toLocaleString()}</td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
      <p style="margin-top: 20px;">
        <strong>Action Required:</strong> Please log in to the admin panel and reconnect these users to restore their HighLevel access.
      </p>
    `;

    // Send email to each admin
    let emailsSent = 0;
    for (const adminEmail of adminEmails) {
      try {
        const emailResponse = await fetch(
          `${supabaseUrl}/functions/v1/send-email`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({
              to: adminEmail,
              subject: `HighLevel Token Expiration Alert - ${tokensToNotify.length} User(s) Need Reconnection`,
              html: emailHtml,
            }),
          }
        );

        if (emailResponse.ok) {
          emailsSent++;
          console.log(`Notification sent to: ${adminEmail}`);
        } else {
          console.error(
            `Failed to send email to ${adminEmail}:`,
            await emailResponse.text()
          );
        }
      } catch (error) {
        console.error(`Error sending email to ${adminEmail}:`, error);
      }
    }

    // Record notifications in database
    const notificationRecords = tokensToNotify.flatMap((token) =>
      adminEmails.map((email) => ({
        notification_type: "token_expired",
        user_id: token.user_id,
        recipient_email: email,
        subject: `HighLevel Token Expiration Alert - ${tokensToNotify.length} User(s) Need Reconnection`,
        metadata: {
          business_name: token.business_name,
          location_name: token.location_name,
          token_expires_at: token.token_expires_at,
        },
      }))
    );

    const { error: insertError } = await supabase
      .from("admin_notifications")
      .insert(notificationRecords);

    if (insertError) {
      console.error("Error recording notifications:", insertError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        expiredCount: expiredTokens.length,
        notifiedCount: tokensToNotify.length,
        emailsSent,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Error in check-expired-tokens function:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
