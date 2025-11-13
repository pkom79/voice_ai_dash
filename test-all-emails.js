// Test script to send all email notifications to a test email address
// Usage: node test-all-emails.js

const SUPABASE_URL = 'https://puuozbogbfeuaewyywte.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'YOUR_SERVICE_KEY';
const TEST_EMAIL = 'pkom79@gmail.com';

async function sendTestNotification() {
  console.log('\n1. Sending Test Notification...');

  const response = await fetch(`${SUPABASE_URL}/functions/v1/send-test-notification`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      userId: '00000000-0000-0000-0000-000000000000',
      email: TEST_EMAIL
    }),
  });

  const result = await response.json();
  console.log('Result:', result);
  return result;
}

async function sendDailySummary() {
  console.log('\n2. Triggering Daily Summary (will send if user has calls)...');

  const response = await fetch(`${SUPABASE_URL}/functions/v1/send-daily-summaries`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });

  const result = await response.json();
  console.log('Result:', result);
  return result;
}

async function sendWeeklySummary() {
  console.log('\n3. Triggering Weekly Summary (will send if user has calls)...');

  const response = await fetch(`${SUPABASE_URL}/functions/v1/send-weekly-summaries`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });

  const result = await response.json();
  console.log('Result:', result);
  return result;
}

async function sendLowBalanceAlert() {
  console.log('\n4. Triggering Low Balance Alerts...');

  const response = await fetch(`${SUPABASE_URL}/functions/v1/check-low-balance-alerts`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });

  const result = await response.json();
  console.log('Result:', result);
  return result;
}

async function sendInsufficientBalanceAlert() {
  console.log('\n5. Triggering Insufficient Balance Alerts...');

  const response = await fetch(`${SUPABASE_URL}/functions/v1/check-insufficient-balance-alerts`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });

  const result = await response.json();
  console.log('Result:', result);
  return result;
}

async function sendServiceWarning() {
  console.log('\n6. Triggering Service Interruption Warnings...');

  const response = await fetch(`${SUPABASE_URL}/functions/v1/check-service-interruption-warnings`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });

  const result = await response.json();
  console.log('Result:', result);
  return result;
}

async function sendInvitation() {
  console.log('\n7. Sending User Invitation...');

  const response = await fetch(`${SUPABASE_URL}/functions/v1/send-user-invitation`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      userEmail: TEST_EMAIL,
      firstName: 'Test',
      lastName: 'User',
      invitedBy: '00000000-0000-0000-0000-000000000000',
      billingPlan: 'unlimited',
      billingAccountId: '00000000-0000-0000-0000-000000000000'
    }),
  });

  const result = await response.json();
  console.log('Result:', result);
  return result;
}

async function main() {
  console.log('='.repeat(60));
  console.log('Testing All Email Notifications');
  console.log(`Sending to: ${TEST_EMAIL}`);
  console.log('='.repeat(60));

  try {
    // Send each type of email
    await sendTestNotification();
    await new Promise(resolve => setTimeout(resolve, 1000));

    await sendDailySummary();
    await new Promise(resolve => setTimeout(resolve, 1000));

    await sendWeeklySummary();
    await new Promise(resolve => setTimeout(resolve, 1000));

    await sendLowBalanceAlert();
    await new Promise(resolve => setTimeout(resolve, 1000));

    await sendInsufficientBalanceAlert();
    await new Promise(resolve => setTimeout(resolve, 1000));

    await sendServiceWarning();
    await new Promise(resolve => setTimeout(resolve, 1000));

    await sendInvitation();

    console.log('\n' + '='.repeat(60));
    console.log('All emails sent! Check ' + TEST_EMAIL);
    console.log('='.repeat(60));
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
