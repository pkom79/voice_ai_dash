# Email Template Variables for Resend

This document provides all the variables available for each email notification type in Voice AI Dash. Use these variables when creating or customizing email templates in Resend.

---

## 1. Low Balance Alert (Pay Per Use Only)

**Email Type:** `low_balance_alert`
**Trigger:** When wallet balance falls below threshold (default: $10.00)
**Frequency:** Once per 24 hours
**Plan:** Pay Per Use only

### Available Variables

| Variable | Type | Description | Example |
|----------|------|-------------|---------|
| `wallet_cents` | Integer | Current wallet balance in cents | `850` (displays as $8.50) |
| `low_balance_threshold_cents` | Integer | Threshold that triggered alert in cents | `1000` (displays as $10.00) |
| `user.first_name` | String | User's first name | `John` |
| `user.last_name` | String | User's last name | `Doe` |
| `user.email` | String | User's email address | `john.doe@example.com` |

### Currency Formatting

All `_cents` values should be formatted to dollars using: `$XX.XX`

Example: `850` cents → `$8.50`

---

## 2. Insufficient Balance Alert (Pay Per Use Only)

**Email Type:** `insufficient_balance_alert`
**Trigger:** On 1st of month when monthly usage exceeds wallet balance
**Frequency:** Once per calendar month
**Plan:** Pay Per Use only

### Available Variables

| Variable | Type | Description | Example |
|----------|------|-------------|---------|
| `wallet_cents` | Integer | Current wallet balance in cents | `5000` (displays as $50.00) |
| `month_spent_cents` | Integer | Current month's usage charges in cents | `7500` (displays as $75.00) |
| `shortfall_cents` | Integer | Difference (month_spent - wallet) in cents | `2500` (displays as $25.00) |
| `user.first_name` | String | User's first name | `John` |
| `user.last_name` | String | User's last name | `Doe` |
| `user.email` | String | User's email address | `john.doe@example.com` |

### Currency Formatting

All `_cents` values should be formatted to dollars using: `$XX.XX`

Example: `7500` cents → `$75.00`

---

## 3. Weekly Call Activity Summary (All Users)

**Email Type:** `weekly_summary`
**Trigger:** Scheduled weekly (e.g., Monday morning)
**Frequency:** Weekly
**Plan:** All users with calls in the past 7 days

### Available Variables

| Variable | Type | Description | Example |
|----------|------|-------------|---------|
| `start_date` | String (ISO) | Beginning of 7-day period | `2025-11-05` |
| `end_date` | String (ISO) | End of 7-day period | `2025-11-12` |
| `total_calls` | Integer | Total number of calls | `45` |
| `inbound_calls` | Integer | Number of inbound calls | `28` |
| `outbound_calls` | Integer | Number of outbound calls | `17` |
| `total_duration_seconds` | Integer | Total call duration in seconds | `8640` |
| `total_cost_cents` | Integer | Total cost of all calls in cents | `4320` (displays as $43.20) |
| `actions_triggered` | Integer | Number of calls that triggered actions | `12` |
| `user.first_name` | String | User's first name | `John` |
| `user.last_name` | String | User's last name | `Doe` |
| `user.email` | String | User's email address | `john.doe@example.com` |

### Calculated Variables (Computed in Template)

| Variable | Calculation | Description | Example |
|----------|-------------|-------------|---------|
| `avg_duration_seconds` | `total_duration_seconds / total_calls` | Average call duration in seconds | `192` |
| `avg_cost_cents` | `total_cost_cents / total_calls` | Average cost per call in cents | `96` (displays as $0.96) |
| `inbound_percentage` | `(inbound_calls / total_calls) * 100` | Percentage of inbound calls | `62%` |
| `outbound_percentage` | `(outbound_calls / total_calls) * 100` | Percentage of outbound calls | `38%` |

### Date Formatting

Format dates from ISO format to readable format:
- `2025-11-05` → `Nov 5, 2025` or `November 5, 2025`

### Duration Formatting

Convert seconds to human-readable format:
- `8640` seconds → `2h 24m`
- `192` seconds → `3m 12s`

### Currency Formatting

All `_cents` values should be formatted to dollars using: `$XX.XX`

---

## 4. Service Interruption Warning (Unlimited Plan Only)

**Email Type:** `service_interruption_warning`
**Trigger:** 9 days after grace period expires
**Frequency:** Once per 24 hours
**Plan:** Unlimited plan with past due payment

### Available Variables

| Variable | Type | Description | Example |
|----------|------|-------------|---------|
| `grace_until` | String (ISO) | Original grace period end date | `2025-11-01T23:59:59Z` |
| `suspension_date` | String (ISO) | Date when service will be suspended | `2025-11-11T23:59:59Z` |
| `next_payment_at` | String (ISO) | Original scheduled payment date | `2025-11-01T00:00:00Z` |
| `user.first_name` | String | User's first name | `John` |
| `user.last_name` | String | User's last name | `Doe` |
| `user.email` | String | User's email address | `john.doe@example.com` |

### Date Formatting

Format dates from ISO format to readable format:
- `2025-11-11T23:59:59Z` → `November 11, 2025`
- Use full month name for urgency and clarity

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

Use these sample values when testing email templates:

```json
{
  "low_balance_alert": {
    "wallet_cents": 850,
    "low_balance_threshold_cents": 1000,
    "user": {
      "first_name": "John",
      "last_name": "Doe",
      "email": "john.doe@example.com"
    }
  },
  "insufficient_balance_alert": {
    "wallet_cents": 5000,
    "month_spent_cents": 7500,
    "shortfall_cents": 2500,
    "user": {
      "first_name": "John",
      "last_name": "Doe",
      "email": "john.doe@example.com"
    }
  },
  "weekly_summary": {
    "start_date": "2025-11-05",
    "end_date": "2025-11-12",
    "total_calls": 45,
    "inbound_calls": 28,
    "outbound_calls": 17,
    "total_duration_seconds": 8640,
    "total_cost_cents": 4320,
    "actions_triggered": 12,
    "user": {
      "first_name": "John",
      "last_name": "Doe",
      "email": "john.doe@example.com"
    }
  },
  "service_interruption_warning": {
    "grace_until": "2025-11-01T23:59:59Z",
    "suspension_date": "2025-11-11T23:59:59Z",
    "next_payment_at": "2025-11-01T00:00:00Z",
    "user": {
      "first_name": "John",
      "last_name": "Doe",
      "email": "john.doe@example.com"
    }
  }
}
```

---

## Resend Template Setup

When creating templates in Resend, use Handlebars syntax:

```handlebars
{{user.first_name}}
{{formatCurrency wallet_cents}}
{{formatDate start_date}}
```

---

**Last Updated:** November 12, 2025
**Version:** 2.1.0
