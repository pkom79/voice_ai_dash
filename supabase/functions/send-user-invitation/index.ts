import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface SendInvitationRequest {
  userId: string;
  inboundPlan?: 'inbound_pay_per_use' | 'inbound_unlimited' | null;
  outboundPlan?: 'outbound_pay_per_use' | null;
  inboundRateCents?: number;
  outboundRateCents?: number;
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
      Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
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
    const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const isServiceRoleKey = token === serviceRoleKey;

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
      .select("id, first_name, last_name, business_name, phone_number, role")
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
      .select("inbound_plan, outbound_plan, inbound_rate_cents, outbound_rate_cents, admin_notes")
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

    // Map to single billing_plan/rate_per_minute_cents for invites
    const inboundPlan = requestData.inboundPlan ?? billingAccount?.inbound_plan ?? null;
    const outboundPlan = requestData.outboundPlan ?? billingAccount?.outbound_plan ?? null;
    const billingPlan =
      inboundPlan === 'inbound_unlimited' ? 'unlimited' : 'pay_per_use';
    const ratePerMinuteCents =
      requestData.inboundRateCents ??
      billingAccount?.inbound_rate_cents ??
      100;

    const invitationData: any = {
      user_id: requestData.userId,
      email: userEmail,
      invitation_token: invitationToken,
      role: targetUser.role || 'client',
      status: 'pending',
      expires_at: expiresAt.toISOString(),
      billing_plan: billingPlan,
      rate_per_minute_cents: ratePerMinuteCents,
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
    const productionUrl = Deno.env.get('APP_URL') || 'https://www.voiceaidash.app';
    const appUrl = baseUrl.includes('supabase.co') ? productionUrl : 'http://localhost:5173';

    const invitationLink = `${appUrl}/accept-invitation?token=${invitationToken}`;

    const resendApiKey = Deno.env.get('RESEND_API_KEY');

    if (!resendApiKey) {
      console.error("Resend API key not configured, aborting email send");
      return new Response(
        JSON.stringify({ error: "Resend API key not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const htmlContent = renderAccountSetupInvitation({
      firstName: targetUser.first_name || "",
      invitationLink,
    });
    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Voice AI Dash <no-reply@notifications.voiceaidash.app>',
        to: [userEmail],
        subject: 'Account Setup Invitation',
        html: htmlContent,
      }),
    });

    const emailResult = await emailResponse.text();
    if (!emailResponse.ok) {
      console.error("Failed to send email. Status:", emailResponse.status);
      console.error("Response:", emailResult);
      return new Response(
        JSON.stringify({ error: "Failed to send invitation email" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log("Email sent successfully:", emailResult);

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

function renderAccountSetupInvitation({
  firstName,
  invitationLink,
}: {
  firstName: string;
  invitationLink: string;
}): string {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html dir="ltr" lang="en">
  <head>
    <meta content="width=device-width" name="viewport" />
    <link rel="preload" as="image" href="https://www.voiceaidash.app/Voice%20AI%20Dash%20Logo%20with%20Text%20Dark.png" />
    <meta content="text/html; charset=UTF-8" http-equiv="Content-Type" />
    <meta name="x-apple-disable-message-reformatting" />
    <meta content="IE=edge" http-equiv="X-UA-Compatible" />
    <meta name="x-apple-disable-message-reformatting" />
    <meta content="telephone=no,address=no,email=no,date=no,url=no" name="format-detection" />
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
  <body>
    <div style="display:none;overflow:hidden;line-height:1px;opacity:0;max-height:0;max-width:0" data-skip-in-text="true">
      Complete your Voice AI Dash account in just a few steps.
    </div>
    <table border="0" width="100%" cellpadding="0" cellspacing="0" role="presentation" align="center">
      <tbody>
        <tr>
          <td>
            <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
              <tbody>
                <tr>
                  <td>
                    <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width:100%">
                      <tbody>
                        <tr>
                          <td>
                            <div style="margin:0;padding:0;background:#0b1220">
                              <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="margin:0;padding:0;background:#0b1220">
                                <tbody>
                                  <tr>
                                    <td>
                                      <tr style="margin:0;padding:0">
                                        <td align="center" data-id="__react-email-column" style="margin:0;padding:28px 24px 8px 24px;background:#0b1220">
                                          <img alt="Voice AI Dash" src="https://www.voiceaidash.app/Voice%20AI%20Dash%20Logo%20with%20Text%20Dark.png" style="display:block;outline:0;border:0;text-decoration:none" width="180" />
                                        </td>
                                      </tr>
                                      <tr style="margin:0;padding:0">
                                        <td class="py-32 px-24" data-id="__react-email-column" style="margin:0;padding:32px 32px 0 32px">
                                          <h1 style="margin:0;padding:0;font-family:Inter, Segoe UI, Roboto, Arial, sans-serif;font-size:24px;line-height:32px;color:#ffffff">
                                            <span>Welcome, ${firstName}!</span>
                                          </h1>
                                          <p style="margin:12px 0 0 0;padding:0;font-family:Inter, Segoe UI, Roboto, Arial, sans-serif;font-size:15px;line-height:24px;color:#cbd5e1">
                                            <span>You’ve been invited to join Voice AI Dash. Complete your account setup by creating a password.</span>
                                          </p>
                                        </td>
                                      </tr>
                                      <tr style="margin:0;padding:0">
                                        <td align="center" data-id="__react-email-column" style="margin:0;padding:24px 32px 8px 32px">
                                          <p style="margin:0;padding:0">
                                            <span><a href="${invitationLink}" rel="noopener noreferrer nofollow" style="color:#ffffff;text-decoration-line:none;display:inline-block;background:#2563eb;font-family:Inter, Segoe UI, Roboto, Arial, sans-serif;font-size:16px;font-weight:600;line-height:44px;padding:0 24px;border-radius:12px;text-align:center;min-width:220px" target="_blank">Set Up Your Account</a></span>
                                          </p>
                                          <div style="margin:0;padding:0;height:8px;line-height:8px"><p style="margin:0;padding:0"><span> </span></p></div>
                                          <p style="margin:8px 0 0 0;padding:0;font-family:Inter, Segoe UI, Roboto, Arial, sans-serif;font-size:12px;line-height:18px;color:#94a3b8">
                                            <span>Or copy and paste this link into your browser: </span><br /><span><a href="${invitationLink}" rel="noopener noreferrer nofollow" style="color:#93c5fd;text-decoration-line:none" target="_blank">${invitationLink}</a></span>
                                          </p>
                                        </td>
                                      </tr>
                                      <tr style="margin:0;padding:0">
                                        <td data-id="__react-email-column" style="margin:0;padding:16px 32px">
                                          <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="margin:0;padding:0">
                                            <tbody>
                                              <tr>
                                                <td>
                                                  <tr style="margin:0;padding:0">
                                                    <td data-id="__react-email-column" style="margin:0;padding:0;height:1px;background:#1f2937"><p style="margin:0;padding:0"><br /></p></td>
                                                  </tr>
                                                </td>
                                              </tr>
                                            </tbody>
                                          </table>
                                          <p style="margin:16px 0 0 0;padding:0;font-family:Inter, Segoe UI, Roboto, Arial, sans-serif;font-size:12px;line-height:20px;color:#94a3b8">
                                            <span>This invitation will expire in 7 days.</span>
                                          </p>
                                        </td>
                                      </tr>
                                      <tr style="margin:0;padding:0">
                                        <td align="center" data-id="__react-email-column" style="margin:0;padding:20px 24px 28px 24px;background:#0b1220">
                                          <p style="margin:0;padding:0;font-family:Inter, Segoe UI, Roboto, Arial, sans-serif;font-size:12px;line-height:18px;color:#64748b"><span>© Voice AI Dash</span></p>
                                          <p style="margin:6px 0 0 0;padding:0;font-family:Inter, Segoe UI, Roboto, Arial, sans-serif;font-size:12px;line-height:18px;color:#64748b"><span>Need help? Contact support at </span><span><a href="mailto:support@smartcompanyai.com" rel="noopener noreferrer nofollow" style="color:#93c5fd;text-decoration-line:none;text-decoration:none" target="_blank">support@smartcompanyai.com</a></span></p>
                                        </td>
                                      </tr>
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                            <p style="margin:0;padding:0"><br /></p>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                </tr>
              </tbody>
            </table>
          </td>
        </tr>
      </tbody>
    </table>
  </body>
</html>`;
}
