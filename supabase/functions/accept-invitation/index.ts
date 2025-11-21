import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface AcceptInvitationRequest {
  token: string;
  password: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const requestData: AcceptInvitationRequest = await req.json();

    if (!requestData.token || !requestData.password) {
      return new Response(
        JSON.stringify({ error: "Missing token or password" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data: invitation, error: invitationError } = await supabaseAdmin
      .from("user_invitations")
      .select("*")
      .eq("invitation_token", requestData.token)
      .maybeSingle();

    if (invitationError || !invitation) {
      return new Response(
        JSON.stringify({ error: "Invitation not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (invitation.status !== "pending") {
      return new Response(
        JSON.stringify({ error: `Invitation has been ${invitation.status}` }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const expiresAt = new Date(invitation.expires_at);
    if (expiresAt < new Date()) {
      await supabaseAdmin
        .from("user_invitations")
        .update({ status: "expired" })
        .eq("id", invitation.id);

      return new Response(
        JSON.stringify({ error: "Invitation has expired" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!invitation.user_id) {
      return new Response(
        JSON.stringify({ error: "Invalid invitation: no user associated" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { error: updatePasswordError } = await supabaseAdmin.auth.admin.updateUserById(
      invitation.user_id,
      { password: requestData.password }
    );

    if (updatePasswordError) {
      console.error("Error updating password:", updatePasswordError);
      return new Response(
        JSON.stringify({ error: "Failed to set password" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    await supabaseAdmin
      .from("user_invitations")
      .update({
        status: "accepted",
        accepted_at: new Date().toISOString(),
      })
      .eq("id", invitation.id);

    // Notify admins who opted into invite-accepted alerts
    try {
      const adminIdsQuery = await supabaseAdmin
        .from("users")
        .select("id, first_name, last_name, business_name")
        .eq("role", "admin")
        .eq("is_active", true);

      const adminIds = (adminIdsQuery.data || []).map((a) => a.id);
      if (adminIds.length > 0) {
        const { data: adminEmails } = await supabaseAdmin
          .from("user_notification_emails")
          .select("email")
          .in("user_id", adminIds)
          .eq("admin_user_accepted_invite", true);

        const recipients = (adminEmails || []).map((e: any) => e.email).filter(Boolean);

        if (recipients.length > 0) {
          const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
          const serviceRoleKey =
            Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

          const html = `
            <h2>✅ Invitation Accepted</h2>
            <p>A user has accepted their invitation.</p>
            <ul>
              <li><strong>Email:</strong> ${invitation.email}</li>
              <li><strong>User ID:</strong> ${invitation.user_id}</li>
            </ul>
          `;

          for (const email of recipients) {
            await fetch(`${supabaseUrl}/functions/v1/send-email`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${serviceRoleKey}`,
              },
              body: JSON.stringify({
                to: email,
                subject: "Invitation Accepted",
                html,
                userId: invitation.user_id,
                emailType: "admin_user_accepted_invite",
              }),
            });
          }
        }
      }
    } catch (notifyError) {
      console.error("Failed to send invite-accepted admin notification:", notifyError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Password set successfully",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
