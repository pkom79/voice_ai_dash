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
      userName: `${user.first_name} ${user.last_name}`,
      userEmail: userPrimaryEmail,
      recipientEmail: email,
      sentAt: new Date().toLocaleString(),
    };

    const emailPayload = {
      to: email,
      subject: '✅ Test Notification - Voice AI Dash',
      userId: user.id,
      emailType: 'test_notification',
      templateId: 'test_notification',
      templateData: templateData,
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