import { supabase } from '../lib/supabase';

interface EmailTemplateData {
  [key: string]: any;
}

interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  userId: string,
  emailType: 'low_balance_alert' | 'insufficient_balance_alert' | 'weekly_summary' | 'service_interruption_warning',
  templateData: EmailTemplateData = {}
): Promise<EmailResult> {
  try {
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-email`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to,
          subject,
          html,
          userId,
          emailType,
          templateData,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to send email');
    }

    const result = await response.json();
    return {
      success: true,
      messageId: result.messageId,
    };
  } catch (error) {
    console.error('Error sending email:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export async function getUserNotificationPreferences(userId: string) {
  const { data: user, error } = await supabase
    .from('users')
    .select('notification_preferences')
    .eq('id', userId)
    .maybeSingle();

  if (error || !user) {
    return null;
  }

  return user.notification_preferences;
}

export async function getBillingAccount(userId: string) {
  const { data, error } = await supabase
    .from('billing_accounts')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data;
}
