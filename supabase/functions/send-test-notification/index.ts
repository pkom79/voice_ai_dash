import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

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

    const { userId, email } = await req.json();

    if (!userId || !email) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: userId and email' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, first_name, last_name')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'User not found' }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { data: emailRecord, error: emailError } = await supabase
      .from('user_notification_emails')
      .select('email, is_primary')
      .eq('user_id', userId)
      .eq('email', email)
      .maybeSingle();

    if (emailError || !emailRecord) {
      return new Response(
        JSON.stringify({ error: 'Email address not found in user notification emails' }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { data: primaryEmail } = await supabase
      .from('user_notification_emails')
      .select('email')
      .eq('user_id', userId)
      .eq('is_primary', true)
      .maybeSingle();

    const userPrimaryEmail = primaryEmail?.email || email;
    const sentAt = new Date().toLocaleString();

    const html = `<!doctype html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml">
<head>
  <meta charset="utf-8">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Test Notification</title>
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
    Success! This is a test notification from Voice AI Dash. Your email notifications are working correctly.
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b1220;">
    <tr>
      <td align="center" class="px-24" style="padding:24px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" class="container"
               style="width:600px; background:#0f172a; border-radius:16px; overflow:hidden; box-shadow:0 10px 30px rgba(0,0,0,0.35);">
          <tr>
            <td align="center" style="padding:28px 24px 8px 24px; background:#0b1220;">
              <a href="https://voiceaidash.com" target="_blank" rel="noopener">
                <img src="https://voiceaidash.com/assets/Voice%20AI%20Dash%20Logo%20with%20Text%20Dark-Di3zKMgu.png"
                     alt="Voice AI Dash" width="180" style="display:block; border:0; outline:0;">
              </a>
            </td>
          </tr>
          <tr>
            <td class="py-32 px-24" style="padding:32px 32px 0 32px;">
              <h1 style="margin:0; font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;
                         font-size:24px; line-height:32px; color:#ffffff;">
                Test Notification
              </h1>
              <p style="margin:12px 0 0 0; font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;
                        font-size:15px; line-height:24px; color:#cbd5e1;">
                Success! This is a test notification.
              </p>
              <p style="margin:4px 0 0 0; font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;
                        font-size:15px; line-height:24px; color:#cbd5e1;">
                Your email notifications are working correctly.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 8px 32px;">
              <p style="margin:0 0 8px 0; font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;
                        font-size:14px; line-height:22px; color:#e5e7eb; font-weight:600;">
                Test Details
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
                     style="border-collapse:separate; background:#0b1220; border:1px solid #1f2937; border-radius:12px;">
                <tr>
                  <td style="padding:12px 16px; font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;
                             font-size:13px; line-height:20px; color:#cbd5e1;">
                    Recipient
                  </td>
                  <td align="right" style="padding:12px 16px; font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;
                                          font-size:13px; line-height:20px; color:#ffffff;">
                    ${email}
                  </td>
                </tr>
                <tr>
                  <td style="padding:12px 16px; font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;
                             font-size:13px; line-height:20px; color:#cbd5e1;">
                    Account
                  </td>
                  <td align="right" style="padding:12px 16px; font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;
                                          font-size:13px; line-height:20px; color:#ffffff;">
                    ${userPrimaryEmail}
                  </td>
                </tr>
                <tr>
                  <td style="padding:12px 16px; font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;
                             font-size:13px; line-height:20px; color:#cbd5e1;">
                    Sent
                  </td>
                  <td align="right" style="padding:12px 16px; font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;
                                          font-size:13px; line-height:20px; color:#ffffff;">
                    ${sentAt}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 24px 32px;">
              <p style="margin:0 0 6px 0; font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;
                        font-size:14px; line-height:22px; color:#e5e7eb; font-weight:600;">
                This test confirms that:
              </p>
              <ul style="margin:6px 0 0 18px; padding:0; font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;
                         font-size:13px; line-height:20px; color:#cbd5e1;">
                <li>Your notification email address is correctly configured.</li>
                <li>Our email delivery system is functioning properly.</li>
                <li>You will receive important alerts and notifications at this address.</li>
              </ul>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:0 32px 24px 32px;">
              <a href="https://voiceaidash.com/" class="btn"
                 style="display:inline-block; background:#2563eb; color:#ffffff;
                        font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;
                        font-size:14px; font-weight:600; line-height:40px;
                        padding:0 20px; border-radius:12px; text-align:center; min-width:180px;">
                Open Dashboard
              </a>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:20px 24px 28px 24px; background:#0b1220;">
              <p style="margin:0; font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;
                        font-size:12px; line-height:18px; color:#64748b;">
                © <span style="white-space:nowrap;">Voice AI Dash</span>
              </p>
              <p style="margin:6px 0 0 0; font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;
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

    const emailPayload = {
      to: email,
      subject: 'Test Notification - Voice AI Dash',
      userId: user.id,
      emailType: 'test_notification',
      html: html,
    };

    const emailResponse = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(emailPayload),
    });

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      throw new Error(`Failed to send email: ${errorText}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Test email sent to ${email}`,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Error sending test notification:', error);
    return new Response(
      JSON.stringify({
        error: error.message || 'Failed to send test notification',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});