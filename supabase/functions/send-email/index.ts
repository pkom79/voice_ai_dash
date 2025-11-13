import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface EmailRequest {
  to: string;
  subject: string;
  html?: string;
  templateId?: string;
  userId: string;
  emailType: 'low_balance_alert' | 'insufficient_balance_alert' | 'weekly_summary' | 'daily_summary' | 'service_interruption_warning' | 'test_notification';
  templateData: any;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { to, subject, html, templateId, userId, emailType, templateData }: EmailRequest = await req.json();

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      throw new Error('RESEND_API_KEY not configured');
    }

    const emailPayload: any = {
      from: 'Voice AI Dash <no-reply@updates.voiceaidash.com>',
      to: [to],
      subject: subject,
    };

    if (templateId) {
      const templateIdFromEnv = Deno.env.get(`RESEND_TEMPLATE_${emailType.toUpperCase()}`);
      console.log('Template lookup:', { emailType, lookupKey: `RESEND_TEMPLATE_${emailType.toUpperCase()}`, templateIdFromEnv });

      if (templateIdFromEnv) {
        emailPayload.template_id = templateIdFromEnv;
        if (templateData && Object.keys(templateData).length > 0) {
          Object.assign(emailPayload, templateData);
        }
        console.log('Using Resend template:', { templateIdFromEnv, templateData });
      } else if (html) {
        emailPayload.html = html;
        console.log('Template not found, using HTML fallback');
      } else {
        throw new Error('Template ID not configured and no HTML fallback provided');
      }
    } else if (html) {
      emailPayload.html = html;
      console.log('No templateId provided, using HTML');
    } else {
      throw new Error('Either templateId or html must be provided');
    }

    console.log('Sending to Resend API:', JSON.stringify(emailPayload, null, 2));

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(emailPayload),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Resend API error:', errorData);
      throw new Error(`Resend API error: ${errorData}`);
    }

    console.log('Email sent successfully via Resend');

    const result = await response.json();

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (supabaseUrl && supabaseServiceKey) {
      await fetch(`${supabaseUrl}/rest/v1/email_delivery_log`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          user_id: userId,
          email_type: emailType,
          recipient_email: to,
          subject: subject,
          status: 'sent',
          resend_message_id: result.id,
          template_data: templateData,
          sent_at: new Date().toISOString(),
        }),
      });
    }

    return new Response(
      JSON.stringify({ success: true, messageId: result.id }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('Error sending email:', error);

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