import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface SendInvitationRequest {
  userId: string;
  billingPlan?: 'pay_per_use' | 'unlimited' | 'complimentary';
  ratePerMinuteCents?: number;
  adminNotes?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

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

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const isServiceRoleKey = token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    let invitingUserId: string | null = null;

    if (!isServiceRoleKey) {
      const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

      if (authError || !user) {
        return new Response(
          JSON.stringify({ error: "Invalid authentication token" }),
          {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      invitingUserId = user.id;

      const { data: adminUser, error: adminError } = await supabaseAdmin
        .from("users")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (adminError || !adminUser || adminUser.role !== "admin") {
        return new Response(
          JSON.stringify({ error: "Unauthorized: Admin access required" }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    const requestData: SendInvitationRequest = await req.json();

    if (!requestData.userId) {
      return new Response(
        JSON.stringify({ error: "Missing userId" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data: targetUser, error: userError } = await supabaseAdmin
      .from("users")
      .select("id, first_name, last_name, business_name, phone_number")
      .eq("id", requestData.userId)
      .maybeSingle();

    if (userError || !targetUser) {
      return new Response(
        JSON.stringify({ error: "User not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data: authUserData } = await supabaseAdmin.auth.admin.getUserById(requestData.userId);

    if (!authUserData?.user?.email) {
      return new Response(
        JSON.stringify({ error: "User email not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const userEmail = authUserData.user.email;

    const { data: billingAccount } = await supabaseAdmin
      .from("billing_accounts")
      .select("billing_plan, rate_per_minute_cents, admin_notes")
      .eq("user_id", requestData.userId)
      .maybeSingle();

    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    const invitationToken = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await supabaseAdmin
      .from("user_invitations")
      .update({ status: 'superseded' })
      .eq("user_id", requestData.userId)
      .eq("status", "pending");

    const invitationData: any = {
      user_id: requestData.userId,
      email: userEmail,
      invitation_token: invitationToken,
      role: 'client',
      status: 'pending',
      expires_at: expiresAt.toISOString(),
      billing_plan: requestData.billingPlan || billingAccount?.billing_plan || 'pay_per_use',
      rate_per_minute_cents: requestData.ratePerMinuteCents || billingAccount?.rate_per_minute_cents || 500,
      admin_notes: requestData.adminNotes || billingAccount?.admin_notes,
      first_name: targetUser.first_name,
      last_name: targetUser.last_name,
      business_name: targetUser.business_name,
      phone_number: targetUser.phone_number,
    };

    if (invitingUserId) {
      invitationData.invited_by = invitingUserId;
    }

    const { data: invitation, error: invitationError } = await supabaseAdmin
      .from("user_invitations")
      .insert(invitationData)
      .select()
      .single();

    if (invitationError) {
      console.error("Error creating invitation:", invitationError);
      return new Response(
        JSON.stringify({ error: "Failed to create invitation" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const baseUrl = Deno.env.get("SUPABASE_URL").replace('/rest/v1', '');
    const productionUrl = Deno.env.get('APP_URL') || 'https://voiceaidash.com';
    const appUrl = baseUrl.includes('supabase.co') ? productionUrl : 'http://localhost:5173';

    const invitationLink = `${appUrl}/accept-invitation?token=${invitationToken}`;

    const resendApiKey = Deno.env.get('RESEND_API_KEY');

    if (resendApiKey) {
      const htmlContent = `<!doctype html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml">
<head>
  <meta charset="utf-8">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Welcome Invitation</title>
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
    Complete your Voice AI Dash account setup.
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b1220;">
    <tr>
      <td align="center" style="padding:24px;">

        <table role="presentation" width="600" cellpadding="0" cellspacing="0" class="container"
               style="width:600px; background:#0f172a; border-radius:16px; overflow:hidden; box-shadow:0 10px 30px rgba(0,0,0,0.35);">

          <tr>
            <td align="center" style="padding:28px 24px 8px 24px; background:#0b1220;">
              <a href="https://voiceaidash.com" target="_blank">
                <img src="https://voiceaidash.com/assets/Voice%20AI%20Dash%20Logo%20with%20Text%20Dark-Di3zKMgu.png"
                     alt="Voice AI Dash" width="180" style="display:block; border:0;">
              </a>
            </td>
          </tr>

          <tr>
            <td class="py-32 px-24" style="padding:32px 32px 0 32px;">
              <h1 style="margin:0; font-family:Inter, Segoe UI, Roboto, Arial, sans-serif;
                         font-size:24px; line-height:32px; color:#ffffff;">
                Welcome, ${targetUser.first_name || 'there'}!
              </h1>
              <p style="margin:12px 0 0 0; font-family:Inter, Segoe UI, Roboto, Arial, sans-serif;
                        font-size:15px; line-height:24px; color:#cbd5e1;">
                You've been invited to join Voice AI Dash. Complete your account setup by creating a password.
              </p>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:24px 32px 8px 32px;">
              <!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${invitationLink}"
                           style="height:44px; v-text-anchor:middle; width:260px;" arcsize="12%"
                           fillcolor="#2563eb" strokecolor="#2563eb">
                <w:anchorlock/>
                <center style="color:#ffffff; font-family:Segoe UI, Arial, sans-serif; font-size:16px; font-weight:600;">
                  Set Up Your Account
                </center>
              </v:roundrect>
              <![endif]-->
              <!--[if !mso]><!-- -->
              <a href="${invitationLink}" class="btn"
                 style="display:inline-block; background:#2563eb; color:#ffffff;
                        font-family:Inter, Segoe UI, Roboto, Arial, sans-serif;
                        font-size:16px; font-weight:600; line-height:44px;
                        padding:0 24px; border-radius:12px; text-align:center;
                        min-width:220px;">
                Set Up Your Account
              </a>
              <!--<![endif]-->

              <div style="height:8px; line-height:8px;">&nbsp;</div>

              <p style="margin:8px 0 0 0; font-family:Inter, Segoe UI, Roboto, Arial, sans-serif;
                        font-size:12px; line-height:18px; color:#94a3b8;">
                Or copy and paste this link into your browser:
                <br>
                <a href="${invitationLink}" style="color:#93c5fd;" class="hover-underline">
                  ${invitationLink}
                </a>
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:16px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="height:1px; background:#1f2937;"></td></tr>
              </table>
              <p style="margin:16px 0 0 0; font-family:Inter, Segoe UI, Roboto, Arial, sans-serif;
                        font-size:12px; line-height:20px; color:#94a3b8;">
                This invitation will expire in 7 days.
              </p>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:20px 24px 28px 24px; background:#0b1220;">
              <p style="margin:0; font-family:Inter, Segoe UI, Roboto, Arial, sans-serif;
                        font-size:12px; line-height:18px; color:#64748b;">
                © Voice AI Dash
              </p>
              <p style="margin:6px 0 0 0; font-family:Inter, Segoe UI, Roboto, Arial, sans-serif;
                        font-size:12px; line-height:18px; color:#64748b;">
                Need help? Contact support at
                <a href="mailto:support@smartcompanyai.com" style="color:#93c5fd; text-decoration:none;">
                  support@smartcompanyai.com
                </a>
              </p>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>

</body>
</html>`;

      const emailResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Voice AI Dash <no-reply@voiceaidash.com>',
          to: [userEmail],
          subject: 'Complete Your Voice AI Dash Account Setup',
          html: htmlContent,
        }),
      });

      const emailResult = await emailResponse.text();
      if (!emailResponse.ok) {
        console.error("Failed to send email. Status:", emailResponse.status);
        console.error("Response:", emailResult);
      } else {
        console.log("Email sent successfully:", emailResult);
      }
    } else {
      console.log("Resend API key not configured, skipping email send");
      console.log("Invitation link:", invitationLink);
    }

    if (invitingUserId) {
      await supabaseAdmin.from("audit_logs").insert({
        admin_user_id: invitingUserId,
        action: "send_invitation",
        target_user_id: requestData.userId,
        details: {
          email: userEmail,
          invitation_id: invitation.id,
        },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        invitationId: invitation.id,
        invitationLink: invitationLink,
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