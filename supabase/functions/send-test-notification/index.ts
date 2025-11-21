import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey =
      Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseServiceKey) {
      throw new Error("Service role key not configured");
    }
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { userId, email } = await req.json();

    if (!userId || !email) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: userId and email" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: user, error: userError } = await supabase
      .from("users")
      .select("id, first_name, last_name")
      .eq("id", userId)
      .single();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "User not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: emailRecord, error: emailError } = await supabase
      .from("user_notification_emails")
      .select("email, is_primary")
      .eq("user_id", userId)
      .eq("email", email)
      .maybeSingle();

    if (emailError || !emailRecord) {
      return new Response(
        JSON.stringify({ error: "Email address not found in user notification emails" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: primaryEmail } = await supabase
      .from("user_notification_emails")
      .select("email")
      .eq("user_id", userId)
      .eq("is_primary", true)
      .maybeSingle();

    const userPrimaryEmail = primaryEmail?.email || email;
    const sentAt = new Date().toLocaleString("en-US", { timeZone: "America/New_York" });

    const html = renderTestNotification({ email, userPrimaryEmail, sentAt });

    const emailPayload = {
      to: email,
      subject: "Test Notification",
      userId: user.id,
      emailType: "test_notification",
      html,
    };

    const emailResponse = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${supabaseServiceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(emailPayload),
    });

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      throw new Error(`Failed to send email: ${errorText}`);
    }

    return new Response(
      JSON.stringify({ success: true, message: `Test email sent to ${email}` }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error sending test notification:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to send test notification" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function renderTestNotification({
  email,
  userPrimaryEmail,
  sentAt,
}: {
  email: string;
  userPrimaryEmail: string;
  sentAt: string;
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
      Your email notifications are set up and ready to go!
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
                                        <td class="px-24" align="center" data-id="__react-email-column" style="margin:0;padding:24px">
                                          <table width="600" border="0" cellpadding="0" cellspacing="0" role="presentation" class="container" style="margin:0;padding:0;width:600px;background:#0f172a;border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,0.35)">
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
                                                      <h1 style="margin:0;padding:0;font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;font-size:24px;line-height:32px;color:#ffffff">
                                                        <span>Test Notification</span>
                                                      </h1>
                                                      <p style="margin:12px 0 0 0;padding:0;font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;font-size:15px;line-height:24px;color:#cbd5e1">
                                                        <span>Success! This is a test notification.</span>
                                                      </p>
                                                      <p style="margin:4px 0 0 0;padding:0;font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;font-size:15px;line-height:24px;color:#cbd5e1">
                                                        <span>Your email notifications are working correctly.</span>
                                                      </p>
                                                    </td>
                                                  </tr>
                                                  <tr style="margin:0;padding:0">
                                                    <td data-id="__react-email-column" style="margin:0;padding:20px 32px 8px 32px">
                                                      <p style="margin:0 0 8px 0;padding:0;font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;font-size:14px;line-height:22px;color:#e5e7eb;font-weight:600">
                                                        <span>Test Details</span>
                                                      </p>
                                                      <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="margin:0;padding:0;border-collapse:separate;background:#0b1220;border:1px solid #1f2937;border-radius:12px">
                                                        <tbody>
                                                          <tr>
                                                            <td>
                                                              <tr style="margin:0;padding:0">
                                                                <td data-id="__react-email-column" style="margin:0;padding:12px 16px;font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;font-size:13px;line-height:20px;color:#cbd5e1">
                                                                  <p style="margin:0;padding:0"><span>Recipient</span></p>
                                                                </td>
                                                                <td align="right" data-id="__react-email-column" style="margin:0;padding:12px 16px;font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;font-size:13px;line-height:20px;color:#ffffff">
                                                                  <p style="margin:0;padding:0"><span>${email}</span></p>
                                                                </td>
                                                              </tr>
                                                              <tr style="margin:0;padding:0">
                                                                <td data-id="__react-email-column" style="margin:0;padding:12px 16px;font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;font-size:13px;line-height:20px;color:#cbd5e1">
                                                                  <p style="margin:0;padding:0"><span>Account</span></p>
                                                                </td>
                                                                <td align="right" data-id="__react-email-column" style="margin:0;padding:12px 16px;font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;font-size:13px;line-height:20px;color:#ffffff">
                                                                  <p style="margin:0;padding:0"><span>${userPrimaryEmail}</span></p>
                                                                </td>
                                                              </tr>
                                                              <tr style="margin:0;padding:0">
                                                                <td data-id="__react-email-column" style="margin:0;padding:12px 16px;font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;font-size:13px;line-height:20px;color:#cbd5e1">
                                                                  <p style="margin:0;padding:0"><span>Sent</span></p>
                                                                </td>
                                                                <td align="right" data-id="__react-email-column" style="margin:0;padding:12px 16px;font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;font-size:13px;line-height:20px;color:#ffffff">
                                                                  <p style="margin:0;padding:0"><span>${sentAt}</span></p>
                                                                </td>
                                                              </tr>
                                                            </td>
                                                          </tr>
                                                        </tbody>
                                                      </table>
                                                    </td>
                                                  </tr>
                                                  <tr style="margin:0;padding:0">
                                                    <td data-id="__react-email-column" style="margin:0;padding:16px 32px 24px 32px">
                                                      <p style="margin:0 0 6px 0;padding:0;font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;font-size:14px;line-height:22px;color:#e5e7eb;font-weight:600">
                                                        <span>This test confirms that:</span>
                                                      </p>
                                                      <ul style="margin:6px 0 0 18px;padding:0;font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;font-size:13px;line-height:20px;color:#cbd5e1">
                                                        <li style="margin:0;padding:0"><p style="margin:0;padding:0"><span>Your notification email address is correctly configured.</span></p></li>
                                                        <li style="margin:0;padding:0"><p style="margin:0;padding:0"><span>Our email delivery system is functioning properly.</span></p></li>
                                                        <li style="margin:0;padding:0"><p style="margin:0;padding:0"><span>You will receive important alerts and notifications at this address.</span></p></li>
                                                      </ul>
                                                    </td>
                                                  </tr>
                                                  <tr style="margin:0;padding:0">
                                                    <td align="center" data-id="__react-email-column" style="margin:0;padding:0 32px 24px 32px">
                                                      <p style="margin:0;padding:0">
                                                        <span><a href="https://www.voiceaidash.app/" rel="noopener noreferrer nofollow" style="color:#ffffff;text-decoration-line:none;display:inline-block;background:#2563eb;font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;font-size:14px;font-weight:600;line-height:40px;padding:0 20px;border-radius:12px;text-align:center;min-width:180px" target="_blank">View Dashboard</a></span>
                                                      </p>
                                                      <div style="margin:0;padding:0;height:8px;line-height:8px"><p style="margin:0;padding:0"><span> </span></p></div>
                                                      <p style="margin:0;padding:0;font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;font-size:12px;line-height:18px;color:#94a3b8">
                                                        <span>If the button does not work, copy and paste this link into your browser: </span><span><a href="https://www.voiceaidash.app/" rel="noopener noreferrer nofollow" style="color:#93c5fd;text-decoration-line:none;text-decoration:none" target="_blank">https://www.voiceaidash.app/</a></span>
                                                      </p>
                                                    </td>
                                                  </tr>
                                                  <tr style="margin:0;padding:0">
                                                    <td align="center" data-id="__react-email-column" style="margin:0;padding:20px 24px 28px 24px;background:#0b1220">
                                                      <p style="margin:0;padding:0;font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;font-size:12px;line-height:18px;color:#64748b">
                                                        <span>© </span><span>Voice AI Dash</span>
                                                      </p>
                                                      <p style="margin:6px 0 0 0;padding:0;font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;font-size:12px;line-height:18px;color:#64748b">
                                                        <span>Need help? Contact support at </span><span><a href="mailto:support@smartcompanyai.com" rel="noopener noreferrer nofollow" style="color:#93c5fd;text-decoration-line:none;text-decoration:none" target="_blank">support@smartcompanyai.com</a></span>
                                                      </p>
                                                    </td>
                                                  </tr>
                                                </td>
                                              </tr>
                                            </tbody>
                                          </table>
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
