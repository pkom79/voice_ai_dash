const SUPABASE_URL = 'https://puuozbogbfeuaewyywte.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is required to run this script');
}

const testEmail = 'pkom79@gmail.com';

const emailTests = [
  {
    name: 'Low Balance Alert',
    templateId: 'low-balance-alert',
    data: {
      to: testEmail,
      subject: '⚠️ Low Wallet Balance Alert',
      templateId: 'low-balance-alert',
      userId: 'test-user',
      emailType: 'low_balance_alert',
      templateData: {
        wallet_cents: 850,
        low_balance_threshold_cents: 1000,
        wallet_balance_formatted: '$8.50',
        threshold_formatted: '$10.00',
        user: {
          first_name: 'Test',
          last_name: 'User',
          email: testEmail
        }
      }
    }
  },
  {
    name: 'Insufficient Balance Alert',
    templateId: 'insufficient-balance-alert',
    data: {
      to: testEmail,
      subject: '🚨 Insufficient Balance - Action Required',
      templateId: 'insufficient-balance-alert',
      userId: 'test-user',
      emailType: 'insufficient_balance_alert',
      templateData: {
        wallet_cents: 5000,
        month_spent_cents: 7500,
        shortfall_cents: 2500,
        wallet_balance_formatted: '$50.00',
        month_spent_formatted: '$75.00',
        shortfall_formatted: '$25.00',
        user: {
          first_name: 'Test',
          last_name: 'User',
          email: testEmail
        }
      }
    }
  },
  {
    name: 'Weekly Summary',
    templateId: 'weekly-activity-summary',
    data: {
      to: testEmail,
      subject: '📊 Your Weekly Call Summary',
      templateId: 'weekly-activity-summary',
      userId: 'test-user',
      emailType: 'weekly_summary',
      templateData: {
        start_date: '2025-11-05T00:00:00Z',
        end_date: '2025-11-12T00:00:00Z',
        total_calls: 45,
        inbound_calls: 28,
        outbound_calls: 17,
        total_duration_seconds: 8640,
        total_cost_cents: 4320,
        actions_triggered: 12,
        total_cost_formatted: '$43.20',
        avg_cost_formatted: '$0.96',
        user: {
          first_name: 'Test',
          last_name: 'User',
          email: testEmail
        }
      }
    }
  },
  {
    name: 'Service Interruption Warning',
    templateId: 'service-interruption-warning',
    data: {
      to: testEmail,
      subject: '⚠️ URGENT: Service Suspension Notice - Action Required',
      templateId: 'service-interruption-warning',
      userId: 'test-user',
      emailType: 'service_interruption_warning',
      templateData: {
        grace_until: '2025-11-01T23:59:59Z',
        suspension_date: '2025-11-11T23:59:59Z',
        next_payment_at: '2025-11-01T00:00:00Z',
        grace_until_formatted: 'November 1, 2025',
        suspension_date_formatted: 'November 11, 2025',
        next_payment_at_formatted: 'November 1, 2025',
        user: {
          first_name: 'Test',
          last_name: 'User',
          email: testEmail
        }
      }
    }
  }
];

async function sendTestEmail(test) {
  console.log(`\nSending: ${test.name}...`);

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(test.data)
    });

    const result = await response.json();

    if (response.ok) {
      console.log(`✓ ${test.name} sent successfully!`);
      console.log(`  Message ID: ${result.messageId}`);
    } else {
      console.error(`✗ ${test.name} failed:`, result);
    }
  } catch (error) {
    console.error(`✗ ${test.name} error:`, error.message);
  }
}

async function runAllTests() {
  console.log('Starting email tests...');
  console.log(`Test recipient: ${testEmail}\n`);

  for (const test of emailTests) {
    await sendTestEmail(test);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n✓ All test emails sent! Check your inbox at pkom79@gmail.com');
}

runAllTests();
