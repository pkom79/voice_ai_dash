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

    const { data: invitation, error: invitationError } = await supabaseAdmin
      .from("user_invitations")
      .insert({
        user_id: requestData.userId,
        invited_by: user.id,
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
      })
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
    const appUrl = baseUrl.includes('supabase.co')
      ? baseUrl.replace('https://', 'https://').replace('.supabase.co', '.supabase.co')
      : 'http://localhost:5173';

    const invitationLink = `${appUrl}/accept-invitation?token=${invitationToken}`;

    const resendApiKey = Deno.env.get('RESEND_API_KEY');

    const htmlEmail = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(to right, #3B82F6, #6366F1); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="color: white; margin: 0;">Voice AI Dash</h1>
          </div>

          <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
            <h2 style="color: #1f2937; margin-top: 0;">Welcome, ${targetUser.first_name}!</h2>

            <p>You've been invited to join Voice AI Dash. Complete your account setup by creating a password.</p>

            <div style="margin: 30px 0;">
              <a href="${invitationLink}"
                 style="display: inline-block; background: #3B82F6; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                Set Up Your Account
              </a>
            </div>

            <p style="color: #6b7280; font-size: 14px;">
              Or copy and paste this link into your browser:<br>
              <a href="${invitationLink}" style="color: #3B82F6; word-break: break-all;">${invitationLink}</a>
            </p>

            <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
              This invitation will expire in 7 days.
            </p>

            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">

            <p style="color: #9ca3af; font-size: 12px; text-align: center;">
              Powered by <a href="https://smartcompanyai.com" style="color: #3B82F6; text-decoration: none;">SmartCompany AI</a>
            </p>
          </div>
        </body>
      </html>
    `;

    if (resendApiKey) {
      const emailResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Voice AI Dash <onboarding@resend.dev>',
          to: [userEmail],
          subject: 'Complete Your Voice AI Dash Account Setup',
          html: htmlEmail,
        }),
      });

      if (!emailResponse.ok) {
        console.error("Failed to send email:", await emailResponse.text());
      }
    } else {
      console.log("Resend API key not configured, skipping email send");
      console.log("Invitation link:", invitationLink);
    }

    await supabaseAdmin.from("audit_logs").insert({
      admin_user_id: user.id,
      action: "send_invitation",
      target_user_id: requestData.userId,
      details: {
        email: userEmail,
        invitation_id: invitation.id,
      },
    });

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
