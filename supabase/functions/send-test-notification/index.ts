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

    const templateData = {
      userEmail: email,
      recipientEmail: userPrimaryEmail,
      sentAt: new Date().toLocaleString(),
    };

    const fallbackHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; background-color: #f5f5f5;">
        <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 8px; overflow: hidden;">
          <div style="padding: 30px 30px 0 30px;">
            <p style="font-size: 18px; margin: 0 0 20px 0;">Hi ${user.first_name} ${user.last_name},</p>
          </div>
          <div style="margin: 0 30px; background-color: #d1fae5; border-left: 4px solid #10b981; padding: 15px; border-radius: 4px;">
            <p style="margin: 0; font-weight: 600;">✅ Success! This is a test notification.</p>
          </div>
          <div style="text-align: center; padding: 30px 0;">
            <div style="font-size: 60px; color: #10b981;">✓</div>
          </div>
          <div style="padding: 0 30px;">
            <p style="text-align: center; font-size: 20px; font-weight: 600; color: #059669; margin: 0 0 30px 0;">
              Your email notifications are working correctly!
            </p>
          </div>
          <div style="margin: 0 30px 30px 30px; background-color: #e0e7ff; border: 1px solid #818cf8; padding: 20px; border-radius: 6px;">
            <p style="margin: 0 0 15px 0; font-weight: 600;">Test Details:</p>
            <p style="margin: 5px 0;">📧 <strong>Recipient:</strong> ${templateData.userEmail}</p>
            <p style="margin: 5px 0;">👤 <strong>Account:</strong> ${templateData.recipientEmail}</p>
            <p style="margin: 5px 0;">📅 <strong>Sent:</strong> ${templateData.sentAt}</p>
          </div>
          <div style="padding: 0 30px 30px 30px;">
            <p style="margin: 0 0 10px 0;">This test confirms that:</p>
            <ul style="margin: 10px 0; padding-left: 20px;">
              <li style="margin: 8px 0;">Your notification email address is correctly configured</li>
              <li style="margin: 8px 0;">Our email delivery system is functioning properly</li>
              <li style="margin: 8px 0;">You will receive important alerts and notifications at this address</li>
            </ul>
          </div>
          <div style="text-align: center; padding: 0 30px 30px 30px;">
            <a href="https://voiceaidash.com/profile"
               style="display: inline-block; background-color: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600;">
              Manage Notification Settings
            </a>
          </div>
          <div style="padding: 0 30px 20px 30px; text-align: center;">
            <p style="font-size: 14px; color: #6b7280; margin: 0;">
              If you did not request this test email, please contact support immediately.
            </p>
          </div>
          <div style="background-color: #f9fafb; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
            <p style="margin: 0 0 5px 0; font-weight: 600; font-size: 14px; color: #374151;"><strong>Voice AI Dash</strong> - Voice Agent Management Platform</p>
            <p style="margin: 5px 0; font-size: 13px; color: #6b7280;">This is a test notification sent from your notification preferences.</p>
            <p style="margin: 5px 0; font-size: 13px;">
              <a href="https://voiceaidash.com/profile" style="color: #2563eb; text-decoration: none;">Manage notification preferences</a>
            </p>
          </div>
        </div>
      </body>
      </html>
    `;

    const emailPayload = {
      to: email,
      subject: '✅ Test Notification - Voice AI Dash',
      userId: user.id,
      emailType: 'test_notification',
      templateId: 'test_notification',
      templateData: templateData,
      html: fallbackHtml,
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