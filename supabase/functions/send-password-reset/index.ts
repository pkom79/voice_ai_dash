import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { Resend } from 'npm:resend@4.0.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface RequestBody {
  email: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { email }: RequestBody = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: 'Email is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendApiKey = Deno.env.get('RESEND_API_KEY')!;
    const appUrl = 'https://www.voiceaidash.app';

    console.log('Processing password reset for:', email);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const resend = new Resend(resendApiKey);

    // Check if user exists by listing users with this email
    const { data: { users }, error: userError } = await supabase.auth.admin.listUsers();

    const user = users?.find(u => u.email === email);

    if (userError || !user) {
      console.log('User not found for email:', email);
      // Don't reveal whether user exists for security
      return new Response(
        JSON.stringify({ message: 'If an account exists with this email, you will receive a password reset link.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('User found, generating reset token...');

    // Generate password reset token
    const { data: tokenData, error: tokenError } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email: email,
    });

    if (tokenError || !tokenData) {
      console.error('Error generating reset token:', tokenError);
      throw new Error('Failed to generate reset token');
    }

    console.log('Token generated successfully');

    // Extract the token from the generated link
    const resetUrl = new URL(tokenData.properties.action_link);
    const token = resetUrl.searchParams.get('token');
    const type = resetUrl.searchParams.get('type');

    if (!token) {
      throw new Error('Failed to extract reset token');
    }

    // Construct our custom reset URL
    const confirmationUrl = `${appUrl}/reset-password?token=${token}&type=${type || 'recovery'}`;

    console.log('Sending email via Resend...');

    // Send email using Resend with the provided Reset Password template
    const emailHtml = `<!doctype html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml">
<head>
  <meta charset="utf-8">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Reset Password</title>
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
    Use this link to reset your Voice AI Dash password.
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b1220;">
    <tr>
      <td align="center" class="px-24" style="padding:24px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" class="container" style="width:600px; background:#0f172a; border-radius:16px; overflow:hidden; box-shadow:0 10px 30px rgba(0,0,0,0.35);">
          <tr>
            <td align="center" style="padding:28px 24px 8px 24px; background:#0b1220;">
              <a href="https://www.voiceaidash.app/" target="_blank" rel="noopener">
                <img src="https://www.voiceaidash.app/Voice%20AI%20Dash%20Logo%20with%20Text%20Dark.png" alt="Voice AI Dash" width="180" style="display:block; border:0; outline:0; text-decoration:none;">
              </a>
            </td>
          </tr>

          <tr>
            <td class="py-32 px-24" style="padding:32px 32px 0 32px;">
              <h1 style="margin:0; font-family:Inter,Segoe UI,Roboto,Arial,sans-serif; font-size:24px; line-height:32px; color:#ffffff;">
                Reset Password
              </h1>
              <p style="margin:12px 0 0 0; font-family:Inter,Segoe UI,Roboto,Arial,sans-serif; font-size:15px; line-height:24px; color:#cbd5e1;">
                Follow this link to reset the password for your account.
              </p>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:24px 32px 8px 32px;">
              <!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${confirmationUrl}" style="height:44px;v-text-anchor:middle;width:240px;" arcsize="12%" fillcolor="#2563eb" strokecolor="#2563eb">
                <w:anchorlock/>
                <center style="color:#ffffff;font-family:Segoe UI, Arial, sans-serif;font-size:16px;font-weight:600;">
                  Reset Password
                </center>
              </v:roundrect>
              <![endif]-->
              <!--[if !mso]><!-- -->
              <a href="${confirmationUrl}" class="btn"
                 style="display:inline-block; background:#2563eb; color:#ffffff; font-family:Inter,Segoe UI,Roboto,Arial,sans-serif; font-size:16px; font-weight:600; line-height:44px; padding:0 24px; border-radius:12px; text-align:center; min-width:200px;">
                Reset Password
              </a>
              <!--<![endif]-->
              <div style="height:8px; line-height:8px;">&nbsp;</div>
              <p style="margin:8px 0 0 0; font-family:Inter,Segoe UI,Roboto,Arial,sans-serif; font-size:12px; line-height:18px; color:#94a3b8;">
                If the button does not work, paste this link into your browser:
                <br>
                <a href="${confirmationUrl}" style="color:#93c5fd;" class="hover-underline">${confirmationUrl}</a>
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:24px 32px 0 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="height:1px; background:#1f2937; line-height:1px; font-size:0;">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:16px 32px 28px 32px;">
              <p style="margin:0; font-family:Inter,Segoe UI,Roboto,Arial,sans-serif; font-size:12px; line-height:20px; color:#94a3b8;">
                If you didn’t request a password reset, you can safely ignore this email. Your password will remain unchanged.
              </p>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:20px 24px 28px 24px; background:#0b1220;">
              <p style="margin:0; font-family:Inter,Segoe UI,Roboto,Arial,sans-serif; font-size:12px; line-height:18px; color:#64748b;">
                © <span style="white-space:nowrap;">Voice AI Dash</span>
              </p>
              <p style="margin:6px 0 0 0; font-family:Inter,Segoe UI,Roboto,Arial,sans-serif; font-size:12px; line-height:18px; color:#64748b;">
                Need help? Contact support at
                <a href="mailto:support@smartcompanyai.com" style="color:#93c5fd; text-decoration:none;">support@smartcompanyai.com</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    try {
      const result = await resend.emails.send({
        from: 'Voice AI Dash <no-reply@notifications.voiceaidash.app>',
        to: email,
        subject: 'Reset your password',
        html: emailHtml,
      });

      console.log('Email sent successfully:', result);
    } catch (emailError: any) {
      console.error('Resend API error:', emailError);
      console.error('Error details:', JSON.stringify(emailError, null, 2));
      throw new Error(`Failed to send email: ${emailError.message || 'Unknown error'}`);
    }

    return new Response(
      JSON.stringify({ message: 'If an account exists with this email, you will receive a password reset link.' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in send-password-reset:', error);
    console.error('Error stack:', error.stack);
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to process password reset request' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
