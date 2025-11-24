import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function getSecret(supabase: SupabaseClient, key: string): Promise<string | null> {
  const envValue = Deno.env.get(key);
  if (envValue) {
    return envValue;
  }

  const { data, error } = await supabase
    .from('app_secrets')
    .select('value')
    .eq('key', key)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data.value;
}

interface CreateUserRequest {
  email: string;
  firstName: string;
  lastName: string;
  businessName: string;
  phoneNumber?: string;
  role?: 'client' | 'admin';
  inboundPlan?: string | null;
  outboundPlan?: string | null;
  inboundRateCents?: number;
  outboundRateCents?: number;
  adminNotes?: string;
  sendInvite?: boolean;
  stripeCustomerId?: string;
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
      business_name: requestData.businessName,
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
      let inboundPlan = requestData.inboundPlan ?? null;
      const outboundPlan = requestData.outboundPlan ?? null;
      let stripeCustomerId: string | null = null;
      let stripeSubscriptionId: string | null = null;
      let nextPaymentAt: string | null = null;

      // Check for existing Stripe Customer
      try {
        const stripeKey = await getSecret(supabaseAdmin, 'STRIPE_SECRET_KEY');
        if (stripeKey) {
          // If a specific Stripe Customer ID is provided, use it.
          // Otherwise, look up by email.
          if (requestData.stripeCustomerId) {
            stripeCustomerId = requestData.stripeCustomerId;
            console.log(`Using provided Stripe Customer ID: ${stripeCustomerId}`);
          } else {
            const customerResponse = await fetch(
              `https://api.stripe.com/v1/customers?email=${encodeURIComponent(requestData.email)}&limit=1`,
              {
                headers: { Authorization: `Bearer ${stripeKey}` },
              }
            );

            if (customerResponse.ok) {
              const customerData = await customerResponse.json();
              if (customerData.data && customerData.data.length > 0) {
                const customer = customerData.data[0];
                stripeCustomerId = customer.id;
                console.log(`Found existing Stripe customer for ${requestData.email}: ${stripeCustomerId}`);
              }
            }
          }

          // If we have a customer ID (either provided or found), check for subscriptions
          if (stripeCustomerId) {
            const subResponse = await fetch(
              `https://api.stripe.com/v1/subscriptions?customer=${stripeCustomerId}&status=active&limit=1`,
              {
                headers: { Authorization: `Bearer ${stripeKey}` },
              }
            );

            if (subResponse.ok) {
              const subData = await subResponse.json();
              if (subData.data && subData.data.length > 0) {
                const sub = subData.data[0];
                stripeSubscriptionId = sub.id;
                inboundPlan = 'inbound_unlimited'; // Auto-upgrade if subscription exists
                nextPaymentAt = new Date(sub.current_period_end * 1000).toISOString();
                console.log(`Found active subscription: ${stripeSubscriptionId}`);
              }
            }
          }
        }
      } catch (err) {
        console.error("Error checking Stripe:", err);
        // Continue without linking Stripe - don't block user creation
      }

      // Ensure at least one plan is present (default to inbound PPU)
      if (!inboundPlan && !outboundPlan) {
        inboundPlan = 'inbound_pay_per_use';
      }

      const inboundRateCents = requestData.inboundRateCents ?? 100;
      const outboundRateCents = requestData.outboundRateCents ?? 100;

      const { error: billingError } = await supabaseAdmin.from("billing_accounts").insert({
        user_id: newUser.user.id,
        inbound_plan: inboundPlan,
        outbound_plan: outboundPlan,
        inbound_rate_cents: inboundRateCents,
        outbound_rate_cents: outboundRateCents,
        wallet_cents: 0,
        first_login_billing_completed: false,
        admin_notes: requestData.adminNotes || null,
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: stripeSubscriptionId,
        next_payment_at: nextPaymentAt,
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
        inbound_plan: requestData.inboundPlan,
        outbound_plan: requestData.outboundPlan,
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
            inboundPlan: requestData.inboundPlan,
            outboundPlan: requestData.outboundPlan,
            inboundRateCents: requestData.inboundRateCents,
            outboundRateCents: requestData.outboundRateCents,
            adminNotes: requestData.adminNotes,
          }),
        });

        if (!inviteResponse.ok) {
          const errorText = await inviteResponse.text();
          console.error("Failed to send invitation:", errorText);
          return new Response(
            JSON.stringify({ error: "Failed to send invitation email" }),
            {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        const inviteData = await inviteResponse.json();
        invitationLink = inviteData.invitationLink;
      } catch (inviteError) {
        console.error("Error sending invitation:", inviteError);
        return new Response(
          JSON.stringify({ error: "Failed to send invitation email" }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
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
