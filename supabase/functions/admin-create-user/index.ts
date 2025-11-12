import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface CreateUserRequest {
  email: string;
  firstName: string;
  lastName: string;
  businessName?: string;
  phoneNumber?: string;
  role?: 'client' | 'admin';
  billingPlan?: 'pay_per_use' | 'unlimited' | 'complimentary';
  ratePerMinuteCents?: number;
  adminNotes?: string;
  sendInvite?: boolean;
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
      console.error("Auth error:", authError);
      return new Response(
        JSON.stringify({ error: "Invalid authentication token" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data: userData, error: userError } = await supabaseAdmin
      .from("users")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    console.log("User data query result:", { userData, userError, userId: user.id });

    if (userError) {
      console.error("Error fetching user role:", userError);
      return new Response(
        JSON.stringify({ error: "Failed to verify user permissions" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!userData || userData.role !== "admin") {
      console.log("Authorization failed:", { userData, expectedRole: "admin" });
      return new Response(
        JSON.stringify({ error: "Unauthorized: Admin access required" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const requestData: CreateUserRequest = await req.json();

    if (!requestData.email || !requestData.firstName || !requestData.lastName) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const tempPassword = crypto.randomUUID();

    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: requestData.email,
      password: tempPassword,
      email_confirm: true,
    });

    if (createError || !newUser.user) {
      console.error("Error creating auth user:", createError);
      return new Response(
        JSON.stringify({ error: createError?.message || "Failed to create user" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { error: profileError } = await supabaseAdmin.from("users").insert({
      id: newUser.user.id,
      first_name: requestData.firstName,
      last_name: requestData.lastName,
      business_name: requestData.businessName || null,
      phone_number: requestData.phoneNumber || null,
      role: requestData.role || "client",
      is_active: true,
    });

    if (profileError) {
      console.error("Error creating user profile:", profileError);
      await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
      return new Response(
        JSON.stringify({ error: "Failed to create user profile" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (requestData.role === "client" || !requestData.role) {
      const billingPlan = requestData.billingPlan || 'pay_per_use';
      const ratePerMinuteCents = requestData.ratePerMinuteCents || 500;

      const { error: billingError } = await supabaseAdmin.from("billing_accounts").insert({
        user_id: newUser.user.id,
        billing_plan: billingPlan,
        rate_per_minute_cents: ratePerMinuteCents,
        wallet_cents: 0,
        admin_notes: requestData.adminNotes || null,
      });

      if (billingError) {
        console.error("Error creating billing account:", billingError);
      }
    }

    const { error: auditError } = await supabaseAdmin.from("audit_logs").insert({
      admin_user_id: user.id,
      action: "create_user",
      target_user_id: newUser.user.id,
      details: {
        email: requestData.email,
        role: requestData.role || "client",
        billing_plan: requestData.billingPlan || 'pay_per_use',
      },
    });

    if (auditError) {
      console.error("Error creating audit log:", auditError);
    }

    let invitationLink = null;

    if (requestData.sendInvite) {
      const sendInviteUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-user-invitation`;

      try {
        const inviteResponse = await fetch(sendInviteUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userId: newUser.user.id,
            billingPlan: requestData.billingPlan,
            ratePerMinuteCents: requestData.ratePerMinuteCents,
            adminNotes: requestData.adminNotes,
          }),
        });

        if (inviteResponse.ok) {
          const inviteData = await inviteResponse.json();
          invitationLink = inviteData.invitationLink;
        } else {
          console.error("Failed to send invitation:", await inviteResponse.text());
        }
      } catch (inviteError) {
        console.error("Error sending invitation:", inviteError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        userId: newUser.user.id,
        invitationLink: invitationLink,
        inviteSent: requestData.sendInvite && invitationLink !== null,
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
