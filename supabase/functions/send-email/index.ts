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
  emailType: 'low_balance_alert' | 'insufficient_balance_alert' | 'weekly_summary' | 'service_interruption_warning';
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
      from: 'Voice AI Dash <onboarding@resend.dev>',
      to: [to],
      subject: subject,
    };

    if (templateId) {
      emailPayload.html = `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Test Email - Template Data</h2>
          <p><strong>Template ID:</strong> ${templateId}</p>
          <h3>Template Variables:</h3>
          <pre style="background: #f4f4f4; padding: 15px; border-radius: 5px;">${JSON.stringify(templateData, null, 2)}</pre>
          <hr>
          <p style="color: #666; font-size: 12px;">This is a test email showing the template ID and data that will be sent to your Resend template.</p>
        </div>
      `;
    } else if (html) {
      emailPayload.html = html;
    } else {
      throw new Error('Either templateId or html must be provided');
    }

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
      throw new Error(`Resend API error: ${errorData}`);
    }

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
