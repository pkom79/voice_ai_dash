# Email Template Variables for Resend

This document provides all the variables available for each email notification type in Voice AI Dash. Use these variables when creating or customizing email templates in Resend.

**IMPORTANT:** All formatted variables are ready to use and display currency/dates in human-readable format. Use the `_formatted` versions in your templates for automatic formatting.

---

## 1. Low Balance Alert (Pay Per Use Only)

**Email Type:** `low_balance_alert`
**Trigger:** When wallet balance falls below threshold (default: $10.00)
**Frequency:** Once per 24 hours
**Plan:** Pay Per Use only

### Available Variables - COPY & PASTE READY

**Formatted Values (Use These in Templates):**
```
{{wallet_balance_formatted}}
{{threshold_formatted}}
{{user.first_name}}
{{user.last_name}}
{{user.email}}
```

### Complete Variable Reference

| Variable | Type | Description | Example Output |
|----------|------|-------------|----------------|
| `wallet_balance_formatted` | String | Current wallet balance (pre-formatted) | `$8.50` |
| `threshold_formatted` | String | Alert threshold (pre-formatted) | `$10.00` |
| `wallet_cents` | Integer | Current wallet balance in cents (raw) | `850` |
| `low_balance_threshold_cents` | Integer | Threshold in cents (raw) | `1000` |
| `user.first_name` | String | User's first name | `John` |
| `user.last_name` | String | User's last name | `Doe` |
| `user.email` | String | User's email address | `john.doe@example.com` |

---

## 2. Insufficient Balance Alert (Pay Per Use Only)

**Email Type:** `insufficient_balance_alert`
**Trigger:** Any time monthly usage exceeds wallet balance
**Frequency:** Once per 24 hours (when condition persists)
**Plan:** Pay Per Use only

### Available Variables - COPY & PASTE READY

**Formatted Values (Use These in Templates):**
```
{{wallet_balance_formatted}}
{{month_spent_formatted}}
{{shortfall_formatted}}
{{user.first_name}}
{{user.last_name}}
{{user.email}}
```

### Complete Variable Reference

| Variable | Type | Description | Example Output |
|----------|------|-------------|----------------|
| `wallet_balance_formatted` | String | Current wallet balance (pre-formatted) | `$50.00` |
| `month_spent_formatted` | String | Current month's usage (pre-formatted) | `$75.00` |
| `shortfall_formatted` | String | Amount short (pre-formatted) | `$25.00` |
| `wallet_cents` | Integer | Current wallet balance in cents (raw) | `5000` |
| `month_spent_cents` | Integer | Current month's usage in cents (raw) | `7500` |
| `shortfall_cents` | Integer | Difference in cents (raw) | `2500` |
| `user.first_name` | String | User's first name | `John` |
| `user.last_name` | String | User's last name | `Doe` |
| `user.email` | String | User's email address | `john.doe@example.com` |

---

## 3. Weekly Call Activity Summary (All Users)

**Email Type:** `weekly_summary`
**Trigger:** Scheduled weekly (e.g., Monday morning)
**Frequency:** Weekly
**Plan:** All users with calls in the past 7 days

### Available Variables - COPY & PASTE READY

**Formatted Values (Use These in Templates):**
```
{{total_cost_formatted}}
{{avg_cost_formatted}}
{{start_date}}
{{end_date}}
{{total_calls}}
{{inbound_calls}}
{{outbound_calls}}
{{total_duration_seconds}}
{{actions_triggered}}
{{user.first_name}}
{{user.last_name}}
{{user.email}}
```

### Complete Variable Reference

| Variable | Type | Description | Example Output |
|----------|------|-------------|----------------|
| `total_cost_formatted` | String | Total cost of all calls (pre-formatted) | `$43.20` |
| `avg_cost_formatted` | String | Average cost per call (pre-formatted) | `$0.96` |
| `start_date` | String (ISO) | Beginning of 7-day period | `2025-11-05T00:00:00Z` |
| `end_date` | String (ISO) | End of 7-day period | `2025-11-12T00:00:00Z` |
| `total_calls` | Integer | Total number of calls | `45` |
| `inbound_calls` | Integer | Number of inbound calls | `28` |
| `outbound_calls` | Integer | Number of outbound calls | `17` |
| `total_duration_seconds` | Integer | Total call duration in seconds | `8640` |
| `total_cost_cents` | Integer | Total cost in cents (raw) | `4320` |
| `actions_triggered` | Integer | Number of calls that triggered actions | `12` |
| `user.first_name` | String | User's first name | `John` |
| `user.last_name` | String | User's last name | `Doe` |
| `user.email` | String | User's email address | `john.doe@example.com` |

### Additional Calculations You Can Do in Templates

You can calculate these in your Resend template if needed:

| Calculation | Formula | Example Result |
|-------------|---------|----------------|
| Inbound Percentage | `(inbound_calls / total_calls) * 100` | `62%` |
| Outbound Percentage | `(outbound_calls / total_calls) * 100` | `38%` |
| Avg Duration | `total_duration_seconds / total_calls` | `192 seconds` |

### Format Helpers You May Need

**Date Formatting:** Convert ISO dates to readable format in your template
- `2025-11-05T00:00:00Z` → `November 5, 2025`

**Duration Formatting:** Convert seconds to human-readable
- `8640` seconds → `2h 24m` or `144 minutes`

---

## 4. Password Reset (All Users)

**Email Type:** `password_reset`
**Trigger:** User requests password reset or admin sends reset link
**Frequency:** On demand
**Plan:** All users

### Available Variables - COPY & PASTE READY

**Formatted Values (Use These in Templates):**
```
{{confirmationUrl}}
{{user.first_name}}
{{user.last_name}}
{{user.email}}
```

### Complete Variable Reference

| Variable | Type | Description | Example Output |
|----------|------|-------------|----------------|
| `confirmationUrl` | String | Complete password reset URL with token | `https://voiceaidash.com/reset-password?token=abc123&type=recovery` |
| `user.first_name` | String | User's first name | `John` |
| `user.last_name` | String | User's last name | `Doe` |
| `user.email` | String | User's email address | `john.doe@example.com` |

---

## 5. Service Interruption Warning (Unlimited Plan Only)

**Email Type:** `service_interruption_warning`
**Trigger:** 9 days after grace period expires
**Frequency:** Once per 24 hours
**Plan:** Unlimited plan with past due payment

### Available Variables - COPY & PASTE READY

**Formatted Values (Use These in Templates):**
```
{{grace_until_formatted}}
{{suspension_date_formatted}}
{{next_payment_at_formatted}}
{{user.first_name}}
{{user.last_name}}
{{user.email}}
```

### Complete Variable Reference

| Variable | Type | Description | Example Output |
|----------|------|-------------|----------------|
| `grace_until_formatted` | String | Grace period end date (pre-formatted) | `November 1, 2025` |
| `suspension_date_formatted` | String | Service suspension date (pre-formatted) | `November 11, 2025` |
| `next_payment_at_formatted` | String | Original payment date (pre-formatted) | `November 1, 2025` |
| `grace_until` | String (ISO) | Grace period end date (raw) | `2025-11-01T23:59:59Z` |
| `suspension_date` | String (ISO) | Service suspension date (raw) | `2025-11-11T23:59:59Z` |
| `next_payment_at` | String (ISO) | Original payment date (raw) | `2025-11-01T00:00:00Z` |
| `user.first_name` | String | User's first name | `John` |
| `user.last_name` | String | User's last name | `Doe` |
| `user.email` | String | User's email address | `john.doe@example.com` |

---

## General Email Properties

All emails include these standard properties:

| Property | Value | Description |
|----------|-------|-------------|
| `from` | `Voice AI Dash <notifications@voiceaidash.com>` | Sender email address |
| `to` | User's email | Recipient email address |
| `subject` | Varies by type | Email subject line |

---

## Email Subjects by Type

| Email Type | Subject Line |
|------------|--------------|
| Low Balance Alert | `⚠️ Low Wallet Balance Alert` |
| Insufficient Balance Alert | `🚨 Insufficient Balance - Action Required` |
| Weekly Summary | `📊 Your Weekly Call Summary` |
| Service Interruption Warning | `⚠️ URGENT: Service Suspension Notice - Action Required` |
| Password Reset | `Reset your password` |

---

## Common Formatting Functions

### Currency Formatting (JavaScript)
```javascript
function formatCurrency(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

// Example: formatCurrency(4320) → "$43.20"
```

### Duration Formatting (JavaScript)
```javascript
function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

// Example: formatDuration(8640) → "2h 24m"
```

### Date Formatting (JavaScript)
```javascript
function formatDate(isoString) {
  return new Date(isoString).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
}

// Example: formatDate('2025-11-12') → "November 12, 2025"
```

---

## Template Design Guidelines

### Brand Colors

- **Primary Blue:** `#2563eb` - Use for buttons, headers, links
- **Alert Red:** `#dc2626` - Use for urgent warnings, errors
- **Warning Yellow:** `#f59e0b` - Use for warnings, low balance alerts
- **Success Green:** `#16a34a` - Use for success messages
- **Neutral Gray:** `#6b7280` - Use for secondary text

### Typography

- **Font Family:** `Arial, sans-serif` (web-safe)
- **Body Text:** `16px`, `line-height: 1.6`
- **Headings:** `font-weight: bold`
- **Labels:** `font-size: 14px`, `text-transform: uppercase`

### Layout

- **Container Width:** `max-width: 600px`
- **Content Padding:** `30px`
- **Card/Box Padding:** `20px`
- **Border Radius:** `8px` for cards, `6px` for buttons

### Mobile Optimization

- Use responsive tables with horizontal scroll if needed
- Stack columns vertically on mobile
- Increase button padding for touch targets
- Ensure minimum 16px font size for readability

---

## Testing Variables

Use these sample values when testing email templates in Resend:

### Low Balance Alert Test Data
```json
{
  "wallet_cents": 850,
  "low_balance_threshold_cents": 1000,
  "wallet_balance_formatted": "$8.50",
  "threshold_formatted": "$10.00",
  "user": {
    "first_name": "John",
    "last_name": "Doe",
    "email": "john.doe@example.com"
  }
}
```

### Insufficient Balance Alert Test Data
```json
{
  "wallet_cents": 5000,
  "month_spent_cents": 7500,
  "shortfall_cents": 2500,
  "wallet_balance_formatted": "$50.00",
  "month_spent_formatted": "$75.00",
  "shortfall_formatted": "$25.00",
  "user": {
    "first_name": "John",
    "last_name": "Doe",
    "email": "john.doe@example.com"
  }
}
```

### Weekly Summary Test Data
```json
{
  "start_date": "2025-11-05T00:00:00Z",
  "end_date": "2025-11-12T00:00:00Z",
  "total_calls": 45,
  "inbound_calls": 28,
  "outbound_calls": 17,
  "total_duration_seconds": 8640,
  "total_cost_cents": 4320,
  "actions_triggered": 12,
  "total_cost_formatted": "$43.20",
  "avg_cost_formatted": "$0.96",
  "user": {
    "first_name": "John",
    "last_name": "Doe",
    "email": "john.doe@example.com"
  }
}
```

### Service Interruption Warning Test Data
```json
{
  "grace_until": "2025-11-01T23:59:59Z",
  "suspension_date": "2025-11-11T23:59:59Z",
  "next_payment_at": "2025-11-01T00:00:00Z",
  "grace_until_formatted": "November 1, 2025",
  "suspension_date_formatted": "November 11, 2025",
  "next_payment_at_formatted": "November 1, 2025",
  "user": {
    "first_name": "John",
    "last_name": "Doe",
    "email": "john.doe@example.com"
  }
}
```

### Password Reset Test Data
```json
{
  "confirmationUrl": "https://voiceaidash.com/reset-password?token=abc123xyz&type=recovery",
  "user": {
    "first_name": "John",
    "last_name": "Doe",
    "email": "john.doe@example.com"
  }
}
```

---

## Resend Template Setup

When creating templates in Resend, use Handlebars syntax:

### Example Usage in HTML Templates

```html
<p>Hi {{user.first_name}},</p>

<p>Your current wallet balance is: {{wallet_balance_formatted}}</p>

<p>Total cost this week: {{total_cost_formatted}}</p>

<p>Service will be suspended on: {{suspension_date_formatted}}</p>
```

### IMPORTANT NOTES

1. **Use formatted variables** - They're ready to display (e.g., `{{wallet_balance_formatted}}` displays as `$8.50`)
2. **User object syntax** - Access user properties with dot notation: `{{user.first_name}}`, `{{user.email}}`
3. **Raw values available** - If you need to do custom formatting, raw values like `{{wallet_cents}}` are also available

---

## Quick Reference - All Variables by Email Type

### Low Balance Alert
```
{{wallet_balance_formatted}}        → $8.50
{{threshold_formatted}}             → $10.00
{{user.first_name}}                 → John
{{user.last_name}}                  → Doe
{{user.email}}                      → john.doe@example.com
```

### Insufficient Balance Alert
```
{{wallet_balance_formatted}}        → $50.00
{{month_spent_formatted}}           → $75.00
{{shortfall_formatted}}             → $25.00
{{user.first_name}}                 → John
{{user.last_name}}                  → Doe
{{user.email}}                      → john.doe@example.com
```

### Weekly Summary
```
{{total_cost_formatted}}            → $43.20
{{avg_cost_formatted}}              → $0.96
{{total_calls}}                     → 45
{{inbound_calls}}                   → 28
{{outbound_calls}}                  → 17
{{total_duration_seconds}}          → 8640
{{actions_triggered}}               → 12
{{start_date}}                      → 2025-11-05T00:00:00Z
{{end_date}}                        → 2025-11-12T00:00:00Z
{{user.first_name}}                 → John
{{user.last_name}}                  → Doe
{{user.email}}                      → john.doe@example.com
```

### Service Interruption Warning
```
{{grace_until_formatted}}           → November 1, 2025
{{suspension_date_formatted}}       → November 11, 2025
{{next_payment_at_formatted}}       → November 1, 2025
{{user.first_name}}                 → John
{{user.last_name}}                  → Doe
{{user.email}}                      → john.doe@example.com
```

### Password Reset
```
{{confirmationUrl}}                 → https://voiceaidash.com/reset-password?token=...
{{user.first_name}}                 → John
{{user.last_name}}                  → Doe
{{user.email}}                      → john.doe@example.com
```

---

## Resend Template Setup Guide

Follow these steps to create email templates in Resend and connect them to Voice AI Dash:

### Step 1: Create Templates in Resend Dashboard

1. Log in to [Resend Dashboard](https://resend.com/emails)
2. Navigate to **Emails** → **Templates**
3. Click **Create Template** for each email type
4. Use the variables listed above in your template HTML
5. Save each template and copy its Template ID (looks like `template_abc123`)

### Step 2: Add Template IDs to Your .env File

Update your `.env` file with the Template IDs you just created:

```env
RESEND_TEMPLATE_LOW_BALANCE=template_your_id_here
RESEND_TEMPLATE_INSUFFICIENT_BALANCE=template_your_id_here
RESEND_TEMPLATE_WEEKLY_SUMMARY=template_your_id_here
RESEND_TEMPLATE_SERVICE_INTERRUPTION=template_your_id_here
RESEND_TEMPLATE_PASSWORD_RESET=template_your_id_here
```

### Step 3: Deploy Edge Functions

After adding the template IDs to `.env`:

1. The system will automatically use your Resend templates
2. If a template ID is not set, it falls back to the built-in HTML emails
3. No code changes needed - just add the environment variables

### Template Behavior

**With Template IDs set:**
- System sends template ID and variables to Resend
- Resend renders your custom template with the variables
- You can edit templates in Resend without code changes

**Without Template IDs:**
- System sends complete HTML email (fallback mode)
- Uses the built-in email templates in the edge functions
- Works immediately without any Resend template setup

### Testing Your Templates

Use the test data provided in this document to preview your templates in Resend before deploying.

---

**Last Updated:** November 12, 2025
**Version:** 4.0.0
