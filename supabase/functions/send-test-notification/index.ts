import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function generateTestEmail(userName: string, userEmail: string, recipientEmail: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #2563eb; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background-color: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
        .success-box { background-color: #d1fae5; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0; border-radius: 4px; }
        .info-box { background-color: #e0e7ff; border: 1px solid #818cf8; padding: 15px; margin: 20px 0; border-radius: 6px; }
        .check-icon { font-size: 48px; color: #10b981; text-align: center; margin: 20px 0; }
        .footer { text-align: center; color: #6b7280; font-size: 14px; margin-top: 30px; }
        .button { display: inline-block; background-color: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🎉 Test Notification</h1>
        </div>
        <div class="content">
          <p>Hi ${userName},</p>

          <div class="success-box">
            <strong>✅ Success! This is a test notification.</strong>
          </div>

          <div class="check-icon">✓</div>

          <p style="text-align: center; font-size: 18px; font-weight: 600; color: #059669;">
            Your email notifications are working correctly!
          </p>

          <div class="info-box">
            <p style="margin: 0 0 10px 0;"><strong>Test Details:</strong></p>
            <p style="margin: 5px 0;">📧 <strong>Recipient:</strong> ${recipientEmail}</p>
            <p style="margin: 5px 0;">👤 <strong>Account:</strong> ${userEmail}</p>
            <p style="margin: 5px 0;">📅 <strong>Sent:</strong> ${new Date().toLocaleString()}</p>
          </div>

          <p>This test confirms that:</p>
          <ul>
            <li>Your notification email address is correctly configured</li>
            <li>Our email delivery system is functioning properly</li>
            <li>You will receive important alerts and notifications at this address</li>
          </ul>

          <p style="text-align: center;">
            <a href="https://voiceaidash.com/profile" class="button">Manage Notification Settings</a>
          </p>

          <p style="margin-top: 30px; font-size: 14px; color: #6b7280;">
            If you did not request this test email, please contact support immediately.
          </p>

          <div class="footer">
            <p><strong>Voice AI Dash</strong> - Voice Agent Management Platform</p>
            <p>This is a test notification sent from your notification preferences.</p>
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
      .select('id, first_name, last_name, email')
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
      .select('email')
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

    const emailPayload = {
      to: email,
      subject: '✅ Test Notification - Voice AI Dash',
      userId: user.id,
      emailType: 'test_notification',
      html: generateTestEmail(`${user.first_name} ${user.last_name}`, user.email, email),
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