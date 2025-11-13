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
          template: 'account-setup-invitation',
          template_data: {
            first_name: targetUser.first_name,
            invitation_link: invitationLink,
            email: userEmail,
          },
        }),
      });

      if (!emailResponse.ok) {
        console.error("Failed to send email:", await emailResponse.text());
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