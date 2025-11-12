import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface BillingAccount {
  user_id: string;
  billing_plan: string;
  grace_until: string | null;
  next_payment_at: string | null;
  last_interruption_warning_at: string | null;
}

interface User {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  notification_preferences: any;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
}

function generateServiceInterruptionEmail(
  user: User,
  graceUntil: string,
  suspensionDate: string
): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #dc2626; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background-color: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
        .urgent-box { background-color: #fee2e2; border: 2px solid #dc2626; padding: 20px; margin: 20px 0; border-radius: 8px; }
        .deadline { font-size: 32px; font-weight: bold; color: #dc2626; text-align: center; margin: 20px 0; }
        .warning-icon { font-size: 48px; text-align: center; margin: 20px 0; }
        .action-box { background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #e5e7eb; }
        .button { display: inline-block; background-color: #dc2626; color: white; padding: 15px 40px; text-decoration: none; border-radius: 6px; margin: 20px 0; font-size: 16px; font-weight: bold; }
        .info-list { background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
        .info-list li { margin: 10px 0; }
        .footer { text-align: center; color: #6b7280; font-size: 14px; margin-top: 30px; }
        .highlight { background-color: #fef3c7; padding: 15px; border-radius: 6px; margin: 20px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="warning-icon">⚠️</div>
          <h1>URGENT: Service Suspension Notice</h1>
        </div>
        <div class="content">
          <p>Dear ${user.first_name},</p>

          <div class="urgent-box">
            <p style="margin: 0; font-size: 18px; font-weight: bold; text-align: center;">
              Your service will be suspended if payment is not received by:
            </p>
            <div class="deadline">${formatDate(suspensionDate)}</div>
          </div>

          <p>We've detected that your account payment is past due. Your grace period expired on ${formatDate(graceUntil)}, and we've extended an additional 3 days for you to complete payment.</p>

          <div class="action-box">
            <h3 style="margin-top: 0; color: #111827;">⏰ What You Need to Do</h3>
            <ol style="color: #374151;">
              <li><strong>Review your payment method</strong> in the Stripe Customer Portal</li>
              <li><strong>Update any expired cards</strong> or payment information</li>
              <li><strong>Complete the outstanding payment</strong> to restore your account to good standing</li>
            </ol>
          </div>

          <div style="text-align: center;">
            <a href="https://voiceaidash.com/billing" class="button">Update Payment Method</a>
          </div>

          <div class="highlight">
            <p><strong>What happens if I don't make a payment?</strong></p>
            <p style="margin-bottom: 0;">If payment is not received by the deadline above, your service will be automatically suspended. This means:</p>
          </div>

          <div class="info-list">
            <ul style="color: #374151;">
              <li>Your voice agents will be disconnected from their phone numbers</li>
              <li>All incoming and outgoing calls will be disabled</li>
              <li>You will lose access to your dashboard until the balance is resolved</li>
              <li>Your call history and data will be preserved</li>
            </ul>
          </div>

          <p style="margin-top: 30px;"><strong>Need Help?</strong></p>
          <p>If you're experiencing issues with payment or need to discuss your account, please contact our support team immediately. We're here to help resolve any concerns.</p>

          <div class="footer">
            <p>Voice AI Dash - Voice Agent Management Platform</p>
            <p>This is an automated notice regarding your account status.</p>
            <p><a href="https://voiceaidash.com/profile">Manage notification preferences</a></p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const now = new Date();
    const nineDaysAgo = new Date(now);
    nineDaysAgo.setDate(nineDaysAgo.getDate() - 9);
    const tenDaysAgo = new Date(now);
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

    const { data: billingAccounts, error: billingError } = await supabase
      .from('billing_accounts')
      .select('user_id, billing_plan, grace_until, next_payment_at, last_interruption_warning_at')
      .eq('billing_plan', 'unlimited')
      .not('grace_until', 'is', null)
      .lte('grace_until', nineDaysAgo.toISOString())
      .gte('grace_until', tenDaysAgo.toISOString())
      .returns<BillingAccount[]>();

    if (billingError) throw billingError;

    const warningsSent = [];

    for (const account of billingAccounts || []) {
      if (!account.grace_until) continue;

      if (account.last_interruption_warning_at) {
        const lastWarning = new Date(account.last_interruption_warning_at);
        const hoursSinceLastWarning = (now.getTime() - lastWarning.getTime()) / (1000 * 60 * 60);
        if (hoursSinceLastWarning < 24) {
          continue;
        }
      }

      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id, first_name, last_name, email, notification_preferences')
        .eq('id', account.user_id)
        .single<User>();

      if (userError || !user) continue;

      const prefs = user.notification_preferences || {};
      if (prefs.service_interruption_alerts !== true) {
        continue;
      }

      const graceUntilDate = new Date(account.grace_until);
      const suspensionDate = new Date(graceUntilDate);
      suspensionDate.setDate(suspensionDate.getDate() + 10);

      const emailHtml = generateServiceInterruptionEmail(
        user,
        account.grace_until,
        suspensionDate.toISOString()
      );

      const emailResponse = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: user.email,
          subject: '⚠️ URGENT: Service Suspension Notice - Action Required',
          html: emailHtml,
          userId: user.id,
          emailType: 'service_interruption_warning',
          templateData: {
            grace_until: account.grace_until,
            suspension_date: suspensionDate.toISOString(),
            next_payment_at: account.next_payment_at,
            grace_until_formatted: formatDate(account.grace_until),
            suspension_date_formatted: formatDate(suspensionDate.toISOString()),
            next_payment_at_formatted: account.next_payment_at ? formatDate(account.next_payment_at) : null,
            user: {
              first_name: user.first_name,
              last_name: user.last_name,
              email: user.email,
            },
          },
        }),
      });

      if (emailResponse.ok) {
        await supabase.rpc('update_last_alert_timestamp', {
          p_user_id: user.id,
          p_alert_type: 'service_interruption',
        });

        warningsSent.push({
          userId: user.id,
          email: user.email,
          graceUntil: formatDate(account.grace_until),
          suspensionDate: formatDate(suspensionDate.toISOString()),
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        warningsSent: warningsSent.length,
        details: warningsSent,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('Error checking service interruption warnings:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});
