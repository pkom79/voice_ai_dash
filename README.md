# Voice AI Dash

**Version:** 1.5.7
**Last Updated:** November 12, 2025

A comprehensive Voice AI Dashboard for managing HighLevel voice agents, call logs, billing, and OAuth integrations.

---

## Table of Contents

- [Brand Identity](#brand-identity)
- [White-Label Policy](#white-label-policy)
- [Typography & Layout](#typography--layout)
- [HighLevel OAuth Integration](#highlevel-oauth-integration)
- [HighLevel API Endpoints](#highlevel-api-endpoints)
- [Database Schema](#database-schema)
- [Row Level Security (RLS)](#row-level-security-rls)
- [Known Issues & Solutions](#known-issues--solutions)
- [Working Features](#working-features)
- [Critical Dependencies](#critical-dependencies)
- [Environment Variables](#environment-variables)
- [Component Patterns](#component-patterns)

---

## Brand Identity

### Official Name
**Voice AI Dash** - Use this consistently across all documentation and UI

### Color Palette

#### Primary Colors
- **Primary Blue**: `bg-blue-600`, `text-blue-600`, `border-blue-600`
  - Used for: Primary buttons, active navigation, links, focus states
  - Hover: `bg-blue-700`, `hover:bg-blue-700`
  - Light variant: `bg-blue-50`, `text-blue-900` (for backgrounds)

#### State Colors
- **Success Green**: `bg-green-600`, `text-green-600`
  - Used for: Success messages, active status indicators, completed states
  - Light variant: `bg-green-50`, `bg-green-100`

- **Error Red**: `bg-red-600`, `text-red-600`
  - Used for: Error messages, delete actions, disconnection actions
  - Light variant: `bg-red-50`, `bg-red-100`

- **Warning Yellow**: `bg-yellow-500`, `text-yellow-600`
  - Used for: Warning messages, alerts
  - Light variant: `bg-yellow-50`, `bg-yellow-100`

- **Info Purple**: `bg-purple-500`, `bg-purple-600`
  - Used for: Statistics and dashboard metrics, usage-based billing displays
  - Light variant: `bg-purple-100`

#### Neutral Colors
- **Text Primary**: `text-gray-900` (headings, primary content)
- **Text Secondary**: `text-gray-600` (descriptions, helper text)
- **Text Tertiary**: `text-gray-500` (labels, metadata)
- **Background**: `bg-gray-50` (page background)
- **Cards**: `bg-white` (card backgrounds)
- **Borders**: `border-gray-200`, `border-gray-300`

### Status Badges (Pills)

**Pattern**: Rounded-full badges with padding and background colors

**IMPORTANT**: All transaction type badges and similar status indicators MUST use ALL CAPS text for consistency across the application (e.g., "TOP UP", "ADMIN CREDIT", "DEDUCTION", not "top up", "admin credit", "deduction").

#### HL Connected Badge
```tsx
<span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded-full">
  HL Connected
</span>
```

#### Agent Badge
```tsx
<span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">
  Agent
</span>
```

#### Success Status Badge
```tsx
<span className="inline-flex px-3 py-1 text-sm font-medium rounded-full bg-green-100 text-green-800">
  Success
</span>
```

#### Failure Status Badge
```tsx
<span className="inline-flex px-3 py-1 text-sm font-medium rounded-full bg-red-100 text-red-800">
  Failure
</span>
```

### Button Styles

#### Primary Button
```tsx
className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
```

#### Secondary Button
```tsx
className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
```

#### Danger Button
```tsx
className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
```

#### Icon Button
```tsx
className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
```

### Logo & Branding Assets

**Logo Files**:
- Light Mode: `src/assets/Voice AI Dash Logo with Text copy.png`
- Dark Mode: `src/assets/Voice AI Dash Logo with Text Dark copy.png`
- Favicon: `public/Voice AI Dash Favicon.png`

**Implementation**:
- Logo automatically switches between light and dark versions based on theme
- Logo height: 32px (h-8) for optimal sidebar fit
- Alt text: "Voice AI Dash"
- Location: Sidebar header at `src/components/DashboardLayout.tsx:89-94`

**Brand Name**: Voice AI Dash (consistently used in page title and alt text)

### Icons

**Library**: [Lucide React](https://lucide.dev/) v0.344.0

**Common Icons Used**:
- `LayoutDashboard` - Dashboard navigation
- `Phone` - Calls and call logs
- `CreditCard` - Billing
- `User` - Profile
- `Users` - User management
- `Settings` - Configuration
- `LogOut` - Sign out
- `Link2` / `Unlink` - Connection status
- `Cpu` - Agents
- `CheckCircle` / `XCircle` - Success/Error states
- `AlertCircle` - Warnings
- `Loader2` - Loading states (with animate-spin)

### Card Styling Pattern

```tsx
<div className="bg-white rounded-lg shadow p-6">
  {/* Card content */}
</div>
```

### Gradient Backgrounds

**Sign-in/Sign-up pages**:
```tsx
className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100"
```

---

## White-Label Policy

### Critical Branding Rule

**NEVER mention HighLevel, GHL, Go High Level, or High Level in any client-facing screens or interfaces.**

This is a white-label application. All client-facing components must use generic terminology that doesn't expose the underlying service provider.

### Client-Facing vs Admin-Only Components

#### Client-Facing Components (NO HIGHLEVEL REFERENCES ALLOWED)
These components are visible to regular users with 'client' role:

- `src/pages/Dashboard.tsx` - Main dashboard
- `src/pages/CallsPage.tsx` - Call logs and history
- `src/pages/ProfilePage.tsx` - User profile settings
- `src/pages/BillingPage.tsx` - Billing and wallet
- `src/pages/OAuthCallback.tsx` - OAuth connection flow (users see this during setup)
- `src/components/DashboardLayout.tsx` - Navigation and layout

**Forbidden Examples:**
- ❌ "Recording playback requires an active HighLevel connection"
- ❌ "Failed to sync with HighLevel"
- ❌ "HighLevel Connected"
- ❌ "Connect to HighLevel"

**Correct Alternatives:**
- ✅ "Recording playback requires an active connection"
- ✅ "Failed to sync calls"
- ✅ "Connected" or "Service Connected"
- ✅ "Connect" or "Connect Service"

#### Admin-Only Components (HIGHLEVEL REFERENCES ACCEPTABLE)
These components are only visible to users with 'admin' role:

- `src/pages/AdminUsersPage.tsx` - User management
- `src/pages/AdminConfigPage.tsx` - System configuration
- `src/pages/AdminCallsAnalytics.tsx` - Analytics dashboard
- `src/services/oauth.ts` - OAuth service (backend logic)
- `src/services/highlevel.ts` - API service (backend logic)
- `supabase/functions/*` - Edge functions (backend)

Admins can see "HighLevel" references because they need to understand the technical integration.

### Acceptable Generic Terms

Use these terms instead of HighLevel references:

- **Connection/Connected** - Instead of "HighLevel connection"
- **Service** - Instead of "HighLevel service"
- **Platform** - Instead of "HighLevel platform"
- **Sync/Synchronize** - Instead of "sync with HighLevel"
- **API Connection** - Instead of "HighLevel API"
- **External Service** - When referring to integrations

### Implementation Checklist

Before deploying any changes:

- [ ] Search all client-facing files for "HighLevel", "GHL", "High Level"
- [ ] Check error messages and alerts visible to clients
- [ ] Review tooltips and help text
- [ ] Verify OAuth callback messages
- [ ] Check success/failure notifications
- [ ] Review any console.log statements that might be visible

### Code Review Guidelines

When reviewing pull requests:

1. **Identify component type** - Is this client-facing or admin-only?
2. **Search for brand names** - Use IDE search for "HighLevel", "GHL", etc.
3. **Check user-visible strings** - Error messages, alerts, tooltips
4. **Review error handling** - Console errors are okay, UI errors must be generic
5. **Verify terminology** - Ensure generic terms are used consistently

### Examples from Codebase

#### ✅ Correct Implementation

```typescript
// CallsPage.tsx - Client facing
alert('Failed to sync calls. Please check your connection and try again.');

// OAuthCallback.tsx - Client facing
setMessage('Successfully connected!');

// Recording error - Client facing
<p className="text-xs text-gray-500 text-center">
  If you experience issues playing the recording, please contact your administrator.
</p>
```

#### ❌ Incorrect Implementation (Fixed)

```typescript
// OLD - Wrong
alert('Failed to sync with HighLevel. Please check your API configuration.');

// OLD - Wrong
setMessage('Successfully connected to HighLevel!');

// OLD - Wrong
<p>Recording playback requires an active HighLevel connection with appropriate permissions.</p>
```

### Enforcement

This policy is **non-negotiable** and must be enforced in:

- All new feature development
- Bug fixes that touch client-facing code
- Refactoring efforts
- Documentation updates

**Breaking this policy is considered a critical bug** that must be fixed immediately before deployment.

---

## Typography & Layout

### Heading Hierarchy

- **H1 (Page Title)**: `text-2xl font-bold text-gray-900`
- **H2 (Section Title)**: `text-lg font-semibold text-gray-900`
- **H3 (Subsection)**: `text-base font-semibold text-gray-900`

### Text Styles

- **Body Text**: `text-sm text-gray-700` or `text-gray-900`
- **Helper Text**: `text-sm text-gray-600`
- **Label Text**: `text-sm font-medium text-gray-700`
- **Metadata**: `text-xs text-gray-500`

### Layout Standards

#### Sidebar
- Width: `w-64` (fixed)
- Background: `bg-white`
- Border: `border-r border-gray-200`
- Mobile: Slide-out with backdrop overlay

#### Main Content Area
- Padding: `p-4 sm:p-6`
- Left margin on desktop: `lg:pl-64`
- Spacing between sections: `space-y-6`

#### Grid Layouts
```tsx
// 2-column responsive
<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

// 4-column stats
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
```

### Form Input Styling

**Standard Input**:
```tsx
<input className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
```

**Input with Icon**:
```tsx
<div className="relative">
  <Icon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
  <input className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
</div>
```

### Tab Navigation Pattern

```tsx
<button className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
  activeTab === 'tab-name'
    ? 'border-blue-600 text-blue-600'
    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
}`}>
```

---

## HighLevel OAuth Integration

### OAuth Flow Overview

1. **Admin initiates connection** for a specific user from the Users page
2. **Generate authorization URL** with state parameter (10-minute expiration)
3. **User redirects to HighLevel** for authorization
4. **HighLevel redirects back** with authorization code and state
5. **Validate state** and exchange code for tokens
6. **Store tokens** in `api_keys` table with user association
7. **Fetch location details** to store location name

### OAuth Configuration

**Files**:
- `src/services/oauth.ts` - OAuth service
- `src/pages/OAuthCallback.tsx` - Callback handler

**Scopes Required**:
```typescript
'voice-ai-agents.readonly voice-ai-agents.write voice-ai-dashboard.readonly voice-ai-agent-goals.readonly voice-ai-agent-goals.write contacts.readonly locations.readonly conversations.readonly conversations/message.readonly'
```

**Note**: The `conversations.readonly` and `conversations/message.readonly` scopes are required for call recording playback functionality.

### State Management

**State Generation**: 32-byte random hex string via `crypto.getRandomValues()`

**State Storage**: `oauth_states` table
- Expires after 10 minutes
- Links userId and adminId
- Deleted after validation

**State Validation**: Located in `oauth.ts:77-93`

### Token Management

**Storage**: `api_keys` table
- `access_token` - Current access token
- `refresh_token` - Used to obtain new access tokens
- `token_expires_at` - Timestamp for expiration
- `location_id` - HighLevel location ID
- `company_id` - HighLevel company ID
- `location_name` - Friendly location name (fetched separately)

**Token Refresh Logic** (`oauth.ts:167-223`):
- Automatically refreshes when token expires or within 5 minutes of expiration
- Preserves refresh_token if not returned in refresh response
- Preserves location_id if not in refresh response
- Called automatically by `getValidAccessToken()` method

### Redirect URI Handling

**Development Override** (`oauth.ts:26-30`):
```typescript
const effectiveRedirectUri = redirectUri.includes('voiceaidash.com') && currentOrigin.includes('localhost')
  ? `${currentOrigin}/oauth/callback`
  : redirectUri;
```

This allows local development with a production-configured redirect URI.

### Location Name Fetching

**Issue**: Location name not always included in token response

**Solution** (`oauth.ts:327-366`):
- After token exchange, fetch location details from `/locations/{locationId}` endpoint
- Extract location name from response
- Update `api_keys` table with location_name
- Also attempted during getUserConnection if location_name is missing

---

## HighLevel API Endpoints

### Base Configuration

**Base URL**: `https://services.leadconnectorhq.com`
**API Version Header**: `Version: 2021-07-28`
**Authorization**: `Bearer {access_token}`

### Agents Endpoints

**File**: `src/services/highlevel.ts:250-310`

#### Endpoint Attempt Strategy (Fallback Pattern)

1. **Try Primary** - Voice AI endpoint:
   ```
   GET /voice-ai/agents?locationId={locationId}
   ```

2. **Fallback** - Conversations endpoint:
   ```
   GET /conversations/ai-agents?locationId={locationId}
   ```

**Response Normalization** (`highlevel.ts:312-338`):
Handles multiple response structures:
- Direct array: `[agents...]`
- Nested in `agents`: `{ agents: [...] }`
- Nested in `data`: `{ data: [...] }`
- Nested in `aiAgents`: `{ aiAgents: [...] }`

**Agent Object Normalization**:
```typescript
{
  id: agent.id || agent._id || agent.agentId,
  name: agent.name || agent.agentName || agent.title || `Agent ${agent.id}`,
  description: agent.description || agent.desc || agent.purpose,
  isActive: agent.isActive ?? agent.active ?? true
}
```

### Calls Endpoint

```
GET /v1/calls?startDate={ISO}&endDate={ISO}
```

**Used in**: `highlevel.ts:55-91`

### Locations Endpoint

```
GET /locations/{locationId}
```

**Used in**: `oauth.ts:327-366`
**Purpose**: Fetch location name and business details

### Rate Limits

**Status**: Not currently enforced in code
**TODO**: Monitor and implement rate limiting if needed

### Error Handling Pattern

```typescript
try {
  const response = await fetch(endpoint, { headers });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('API Error:', response.status, errorText);
    throw new Error(`API call failed: ${response.statusText}`);
  }

  const data = await response.json();
  return normalizeResponse(data);
} catch (error) {
  console.error('Error:', error);
  throw error;
}
```

---

## Database Schema

### Core Tables (11 total)

#### 1. **users** (extends auth.users)
- `id` uuid PRIMARY KEY → auth.users(id)
- `role` text ('client' | 'admin')
- `first_name` text
- `last_name` text
- `business_name` text
- `phone_number` text
- `is_active` boolean
- `last_login` timestamptz
- `notification_preferences` jsonb
- `created_at`, `updated_at` timestamptz

**Purpose**: Store user profile information and roles

#### 2. **agents**
- `id` uuid PRIMARY KEY
- `highlevel_agent_id` text UNIQUE
- `name` text
- `description` text
- `configuration` jsonb
- `is_active` boolean
- `created_at`, `updated_at` timestamptz

**Purpose**: Store HighLevel agent information

#### 3. **phone_numbers**
- `id` uuid PRIMARY KEY
- `phone_number` text UNIQUE
- `label` text
- `is_active` boolean
- `created_at` timestamptz

**Purpose**: Track phone numbers used in calls

#### 4. **user_agents** (junction table)
- `user_id` uuid → users(id)
- `agent_id` uuid → agents(id)
- `assigned_at` timestamptz
- PRIMARY KEY (user_id, agent_id)

**Purpose**: Many-to-many relationship between users and agents

#### 5. **user_phone_numbers** (junction table)
- `user_id` uuid → users(id)
- `phone_number_id` uuid → phone_numbers(id)
- `assigned_at` timestamptz
- PRIMARY KEY (user_id, phone_number_id)

**Purpose**: Many-to-many relationship between users and phone numbers

#### 6. **billing_accounts**
- `id` uuid PRIMARY KEY
- `user_id` uuid UNIQUE → users(id)
- `payment_model` text ('flat_fee' | 'pay_per_use')
- `wallet_balance` decimal(10,2)
- `monthly_fee` decimal(10,2)
- `stripe_customer_id` text
- `auto_replenish_enabled` boolean
- `auto_replenish_threshold` decimal(10,2)
- `auto_replenish_amount` decimal(10,2)
- `created_at`, `updated_at` timestamptz

**Purpose**: Manage user billing and wallet balance

#### 7. **transactions**
- `id` uuid PRIMARY KEY
- `user_id` uuid → users(id)
- `type` text ('replenishment' | 'deduction' | 'refund' | 'fee')
- `amount` decimal(10,2)
- `balance_before` decimal(10,2)
- `balance_after` decimal(10,2)
- `description` text
- `stripe_payment_id` text
- `metadata` jsonb
- `created_at` timestamptz

**Purpose**: Track all billing transactions

#### 8. **calls**
- `id` uuid PRIMARY KEY
- `highlevel_call_id` text UNIQUE
- `user_id` uuid → users(id)
- `agent_id` uuid → agents(id)
- `phone_number_id` uuid → phone_numbers(id)
- `direction` text ('inbound' | 'outbound')
- `contact_name` text
- `from_number` text
- `to_number` text
- `status` text
- `duration_seconds` integer
- `cost` decimal(10,4)
- `action_triggered` text
- `sentiment` text
- `summary` text
- `transcript` text
- `recording_url` text
- `workflow_names` text[]
- `notes` text
- `tags` text[]
- `latency_ms` integer
- `is_test_call` boolean
- `call_started_at` timestamptz
- `call_ended_at` timestamptz
- `metadata` jsonb
- `created_at`, `updated_at` timestamptz

**Purpose**: Store all call data synced from HighLevel

#### 9. **api_keys**
- `id` uuid PRIMARY KEY
- `name` text
- `service` text ('highlevel')
- `user_id` uuid → users(id)
- `access_token` text
- `refresh_token` text
- `token_expires_at` timestamptz
- `location_id` text
- `location_name` text
- `company_id` text
- `is_active` boolean
- `last_used_at` timestamptz
- `created_by` uuid → users(id)
- `created_at`, `updated_at` timestamptz

**Purpose**: Store OAuth tokens and API credentials per user

**Note**: Field renamed from `encrypted_key` to `access_token` in OAuth migration

#### 10. **oauth_states**
- `id` uuid PRIMARY KEY
- `state` text UNIQUE
- `user_id` uuid → users(id)
- `admin_id` uuid → users(id)
- `expires_at` timestamptz
- `created_at` timestamptz

**Purpose**: Temporary storage for OAuth state validation

#### 11. **sync_status**
- `id` uuid PRIMARY KEY
- `service` text UNIQUE
- `last_sync_at` timestamptz
- `last_sync_status` text ('success' | 'failure')
- `last_sync_message` text
- `records_synced` integer
- `created_at`, `updated_at` timestamptz

**Purpose**: Track sync status for external services

#### 12. **audit_logs**
- `id` uuid PRIMARY KEY
- `admin_user_id` uuid → users(id)
- `action` text
- `target_user_id` uuid → users(id)
- `details` jsonb
- `ip_address` text
- `created_at` timestamptz

**Purpose**: Audit trail for admin actions

### Foreign Key Relationships

- **Cascade Deletes**: user_agents, user_phone_numbers, billing_accounts, transactions, calls
- **Set NULL**: agents, phone_numbers in calls table, audit_logs references

### Database Triggers

**updated_at triggers** on:
- users
- agents
- billing_accounts
- calls
- api_keys
- sync_status

**Function**: `update_updated_at_column()` - Automatically sets updated_at to current timestamp

---

## Row Level Security (RLS)

### Security Philosophy

**All tables have RLS enabled** - No exceptions

### Access Patterns

#### Admin Access
Admins have full access to all data across all tables using pattern:
```sql
EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
```

#### Client Access
Clients can only access their own data using pattern:
```sql
user_id = auth.uid()
```

### Critical RLS Policies by Table

#### users table
- **SELECT**: Users can view own profile OR admins can view all
- **UPDATE**: Users can update own profile (self) OR admins can update any
- **INSERT**: Admins only
- **DELETE**: Admins only

#### calls table
- **SELECT**: Users view own calls OR admins view all
- **UPDATE**: Users can update own call notes only
- **INSERT/DELETE**: Admins only (managed via sync)

#### api_keys table
- **ALL operations**: User-specific access (user_id = auth.uid()) OR admin access
- **Note**: Modified in migration `20251110235309` to use `user_id` instead of `created_by`

#### billing_accounts table
- **SELECT**: Users view own account OR admins view all
- **INSERT**: Automatic on signup (handled by application logic)
- **UPDATE/DELETE**: Admins only

#### agents table
- **SELECT**: Users can view assigned agents (via user_agents join) OR admins view all
- **INSERT/UPDATE/DELETE**: Admins only

#### oauth_states table
- **SELECT**: User can view own states OR admin can view all
- **INSERT**: Authenticated users (for creating OAuth flows)
- **DELETE**: Own states OR admin

### Known RLS Issues and Fixes

#### Issue: Circular RLS Dependencies
**Migration**: `20251111005733_fix_circular_rls_dependency_v3.sql`

**Problem**: RLS policies referencing other tables with RLS created circular dependencies

**Solution**:
- Simplified policies to avoid complex joins in USING clauses where possible
- Used user_id direct comparison instead of subqueries when feasible
- Separated admin checks from ownership checks

#### Issue: Billing Account Creation on Signup
**Migration**: `20251110204958_fix_billing_account_signup_policy.sql`

**Problem**: Users couldn't create billing accounts during signup

**Solution**: Added INSERT policy for authenticated users with proper WITH CHECK

### RLS Testing Checklist

When modifying tables or policies:
- [ ] Can admins access all records?
- [ ] Can clients access only their own records?
- [ ] Can unauthenticated users access nothing?
- [ ] Do INSERT operations work for legitimate use cases?
- [ ] Are there any circular dependencies?

---

## Known Issues & Solutions

### 1. Agent Endpoint Fallback Strategy

**Issue**: HighLevel API has multiple possible endpoints for agents, and availability varies

**Solution** (`highlevel.ts:271-305`):
1. Try `/voice-ai/agents?locationId={id}` first
2. If fails, fallback to `/conversations/ai-agents?locationId={id}`
3. Log both attempts for debugging

**Why**: API documentation unclear, different HighLevel versions return different structures

### 2. Agent Name Placeholder Replacement

**Issue**: When agents are auto-created from calls without name, generic name "Agent {id}" is used

**Solution** (`highlevel.ts:139-155`):
- Check if existing agent name starts with "Agent "
- If yes, and real name is available, update with real name
- Preserves description if already exists

**Why**: Agents may be referenced in calls before being fetched from API

### 3. Location Name Missing from Token Response

**Issue**: OAuth token response doesn't always include location name, only location_id

**Solution** (`oauth.ts:327-366`):
- After token exchange, make additional API call to `/locations/{locationId}`
- Extract name from response (tries multiple fields: name, location.name, businessName)
- Update api_keys record with location_name
- Also retry fetch in getUserConnection if name still missing

**Why**: Better UX to show location name instead of UUID in UI

### 4. Redirect URI Localhost Override

**Issue**: Production redirect URI registered with HighLevel doesn't work for local development

**Solution** (`oauth.ts:26-30`):
```typescript
const effectiveRedirectUri = redirectUri.includes('voiceaidash.com')
  && currentOrigin.includes('localhost')
    ? `${currentOrigin}/oauth/callback`
    : redirectUri;
```

**Why**: Allows seamless local development without changing HighLevel OAuth app settings

### 5. Refresh Token Preservation

**Issue**: HighLevel sometimes doesn't return refresh_token in refresh response

**Solution** (`oauth.ts:206-209`):
```typescript
if (!tokens.refresh_token) {
  tokens.refresh_token = tokenData.refresh_token;
}
```

**Why**: Prevents loss of refresh capability, maintains continuous access

### 6. Test Call Identification

**Issue**: Need to filter out test/demo calls from analytics

**Solution** (`highlevel.ts:208-216`):
```typescript
const testIndicators = ['test', 'demo', 'sample', '1234567890'];
return testIndicators.some(
  indicator => phone.includes(indicator) || contactName.includes(indicator)
);
```

**Why**: Test calls skew metrics and billing calculations

### 7. RLS Circular Dependencies

**Issue**: Complex RLS policies with joins caused circular dependency errors

**Solution** (Migration `20251111005733`):
- Simplified policies to avoid nested subqueries
- Used direct column comparisons where possible
- Split complex policies into simpler, separate policies

**Why**: PostgreSQL RLS engine has limitations on policy complexity

### 8. Cost Calculation for Calls

**Formula** (`highlevel.ts:202-206`):
```typescript
const costPerMinute = 0.05;
const minutes = durationSeconds / 60;
return parseFloat((minutes * costPerMinute).toFixed(4));
```

**Note**: Cost per minute is hardcoded, may need to be configurable per user/plan in future

---

## Working Features

### ✅ Authentication System
- **Email/Password** signup and signin via Supabase Auth
- **Password Reset** flow with email
- **Protected Routes** with redirect to signin
- **Role-based Access** (admin vs client)
- **Profile Management** with editable fields

**Files**: `src/contexts/AuthContext.tsx`, `src/components/ProtectedRoute.tsx`

### ✅ HighLevel OAuth Connection
- **Per-User OAuth** - Each user can have their own HighLevel connection
- **Admin-Initiated** - Admins connect users from Users page
- **State Validation** - Secure state parameter with expiration
- **Token Management** - Automatic refresh before expiration
- **Disconnect Flow** - Clean removal of tokens

**Files**: `src/services/oauth.ts`, `src/pages/OAuthCallback.tsx`

### ✅ Agent Management
- **Fetch Agents** from HighLevel via API
- **Assign Agents** to users (many-to-many)
- **Unassign Agents** with confirmation
- **Status Badges** showing connection and agent assignment
- **Agent Modal** with assign/remove actions

**Files**: `src/services/highlevel.ts`, `src/pages/AdminUsersPage.tsx`

### ✅ Phone Number Filtering (v1.5.7)
- **Agent-Phone Number Relationship** - Phone numbers are linked to specific agents via direct assignment or number pools
- **Dynamic Phone Number Loading** - Phone numbers automatically update based on selected agent
- **Formatted Display** - Phone numbers shown in user-friendly format: `+1 (555) 123-4567`
- **Bidirectional Filtering** - Filters calls by matching both from_number and to_number
- **Number Pool Support** - Handles agents with multiple phone numbers via HighLevel number pools
- **OAuth Integration** - Uses `phonenumbers.read` and `numberpools.read` scopes
- **Auto-Sync** - Phone numbers sync automatically during login and manual sync operations
- **RLS Security** - Users can only see phone numbers assigned to their agents

**Implementation Details**:
- Database: `agent_phone_numbers` junction table links agents to phone numbers
- API Endpoints:
  - `GET /voice-ai/agents/:agentId` - Fetch agent details with phone assignments
  - `GET /phone-system/numbers/location/:locationId` - Fetch all location phone numbers
  - `GET /phone-system/number-pools` - Fetch number pools for location
- Service Methods:
  - `fetchAgentDetails()` - Get agent's inbound phone number and numberPoolId
  - `fetchPhoneNumbers()` - Get all phone numbers for a location
  - `fetchNumberPools()` - Get number pools and their assigned numbers
  - `syncPhoneNumbersForUser()` - Sync phone numbers for user's assigned agents
- Pages: Dashboard and Call Logs both include phone number filtering
- Utility: `formatPhoneNumber()` in `src/utils/formatting.ts`

**Migration**: `add_agent_phone_numbers_relationship.sql`

**Files**:
- `src/services/highlevel.ts` (lines 419-650)
- `src/utils/formatting.ts` (lines 21-41)
- `src/pages/Dashboard.tsx` (phone number state and filtering)
- `src/pages/CallsPage.tsx` (phone number state and filtering)
- `src/contexts/SyncContext.tsx` (phone number sync integration)

### ✅ Call Syncing
- **Manual Sync** initiated by admin
- **Date Range Filtering** (optional)
- **Automatic Deduplication** via highlevel_call_id
- **Agent Auto-Creation** if referenced in call
- **Phone Number Tracking** with auto-creation
- **Cost Calculation** based on duration
- **Test Call Filtering** for analytics

**Files**: `src/services/highlevel.ts` (syncCalls method)

### ✅ Dashboard Statistics
- **Total Calls** count
- **Inbound/Outbound** distribution
- **Average Duration** calculation
- **Actions Triggered** count
- **Visual Progress Bars** for call distribution
- **Percentage Changes** (placeholder)

**Files**: `src/pages/Dashboard.tsx`

### ✅ Billing Account System
- **Auto-Creation** on user signup
- **Wallet Balance** tracking
- **Payment Model** selection (flat_fee vs pay_per_use)
- **Auto-Replenish** settings
- **Transaction History** logging

**Files**: Database triggers, `src/pages/BillingPage.tsx`

### ✅ Admin User Management
- **User List** with search
- **Connection Status** indicators
- **OAuth Management** per user
- **Agent Assignment** interface
- **User Details** panel

**Files**: `src/pages/AdminUsersPage.tsx`

### ✅ Dark Mode Toggle
- **Theme Persistence** in localStorage
- **System-wide** toggle in header
- **Icon Switch** (Sun/Moon)

**Files**: `src/components/DashboardLayout.tsx:23-39`

### ✅ Audit Logging
- **Admin Actions** tracking
- **Target User** recording
- **Timestamp** and details
- **Viewable** in Configuration page

**Files**: `audit_logs` table, `src/pages/AdminConfigPage.tsx`

### ✅ Sync Status Tracking
- **Last Sync Time** display
- **Success/Failure** status
- **Records Synced** count
- **Error Messages** storage

**Files**: `sync_status` table, `src/pages/AdminConfigPage.tsx`

### ✅ Master Sync System (v1.4.0 - November 11, 2025)
- **Global Sync Button** in header (next to theme toggle)
- **Per-User Sync Tracking** with timestamp storage
- **Automatic Sync on Login** - Background sync when user signs in
- **Real-Time Sync Status** display with relative time (e.g., "Synced 2 minutes ago")
- **Cross-Page Data Refresh** - Dashboard and Call Logs auto-update after sync
- **Unified Sync Experience** - Single sync button updates all data
- **Mobile-Optimized** - Larger sync icon (24x24px) on mobile devices for better touch targets

**Implementation Details**:
- **SyncContext** (`src/contexts/SyncContext.tsx`) - Global sync state management
- **Database Schema** - Added `user_id` column to `sync_status` table for per-user tracking
- **Auto-Sync** - Integrated into `AuthContext` to trigger on SIGNED_IN event
- **UI Components** - Sync button removed from individual pages, centralized in header
- **Status Display** - Small text below sync button shows last sync time or status message

**Migration**: `20251111143400_add_per_user_sync_tracking.sql`

**Key Features**:
- Persistent sync status across page navigation
- Graceful error handling with user-friendly messages
- Loading states with animated spinner during sync
- Silent background sync on login without blocking UI
- Timestamp formatting with relative time display

---

## Critical Dependencies

### DO NOT MODIFY Without Review

#### 1. Token Refresh Mechanism
**Files**: `src/services/oauth.ts:167-223`, `oauth.ts:225-276`

**Dependencies**:
- `api_keys` table structure (access_token, refresh_token, token_expires_at)
- `getValidAccessToken()` calls in highlevel.ts
- All HighLevel API calls depend on this

**Breaking Changes Risk**: All API calls will fail if token refresh breaks

#### 2. RLS Policies
**Files**: All migration files, especially `20251110235309` and `20251111005733`

**Dependencies**:
- User role checks throughout application
- Data isolation between clients
- Admin access to all records

**Breaking Changes Risk**: Data leaks, unauthorized access, or complete lockout

#### 3. OAuth State Validation
**Files**: `src/services/oauth.ts:77-93`, `src/pages/OAuthCallback.tsx`

**Dependencies**:
- `oauth_states` table
- 10-minute expiration window
- userId and adminId linking

**Breaking Changes Risk**: OAuth flow fails, security vulnerabilities

#### 4. Agent Normalization Logic
**Files**: `src/services/highlevel.ts:312-338`

**Dependencies**:
- Multiple HighLevel API response formats
- Agent table structure
- UI displaying agent names

**Breaking Changes Risk**: Agents won't display, assignment fails

#### 5. Billing Account Creation
**Files**: Application signup flow, `billing_accounts` table

**Dependencies**:
- User signup process
- RLS policy allowing INSERT
- Default values for balance, payment_model

**Breaking Changes Risk**: Signups fail, users locked out

#### 6. Call Cost Calculation
**Files**: `src/services/highlevel.ts:202-206`

**Dependencies**:
- `calls` table cost column
- Billing deduction logic (if implemented)
- Dashboard cost displays

**Breaking Changes Risk**: Incorrect billing, revenue loss

#### 7. Database Triggers (updated_at)
**Files**: `20251110203230_create_initial_schema.sql:500-526`

**Dependencies**:
- All tables with updated_at column
- Timestamp tracking throughout app

**Breaking Changes Risk**: Stale data indicators, sync issues

---

## Environment Variables

### Required Variables

#### Supabase
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

#### HighLevel OAuth
```env
VITE_HIGHLEVEL_CLIENT_ID=your-client-id
VITE_HIGHLEVEL_CLIENT_SECRET=your-client-secret
VITE_HIGHLEVEL_AUTH_URL=https://marketplace.gohighlevel.com/oauth/chooselocation
VITE_HIGHLEVEL_TOKEN_URL=https://services.leadconnectorhq.com/oauth/token
VITE_HIGHLEVEL_REDIRECT_URI=https://yourdomain.com/oauth/callback
```

#### HighLevel API
```env
VITE_HIGHLEVEL_API_URL=https://services.leadconnectorhq.com
```

### Security Considerations

⚠️ **CLIENT_SECRET**: Should ideally be in a backend service, not exposed to frontend
- Current implementation exposes it in browser
- Consider moving token exchange to Edge Function for production

⚠️ **ANON_KEY**: Public key, safe to expose, but rate-limited by Supabase

✅ **All VITE_ prefixed vars**: Bundled into client code, consider security implications

### Development vs Production

**Development**: Can override REDIRECT_URI to localhost automatically (see Known Issues #4)

**Production**: Must match registered OAuth app redirect URI exactly

---

## Component Patterns

### Tab Navigation Pattern

**Used in**: ProfilePage, AdminConfigPage

```tsx
const [activeTab, setActiveTab] = useState<'tab1' | 'tab2'>('tab1');

<div className="border-b border-gray-200">
  <nav className="flex -mb-px">
    <button
      onClick={() => setActiveTab('tab1')}
      className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
        activeTab === 'tab1'
          ? 'border-blue-600 text-blue-600'
          : 'border-transparent text-gray-500 hover:text-gray-700'
      }`}
    >
      Tab 1
    </button>
  </nav>
</div>
```

### Modal Pattern

**Used in**: AdminUsersPage (Agent Management)

```tsx
{showModal && (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
      <div className="p-6 border-b">
        {/* Header */}
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        {/* Content */}
      </div>
      <div className="p-6 border-t">
        {/* Footer */}
      </div>
    </div>
  </div>
)}
```

### Loading State Pattern

```tsx
{loading ? (
  <div className="flex items-center justify-center py-12">
    <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
  </div>
) : (
  {/* Content */}
)}
```

### Error/Success Message Pattern

```tsx
{success && (
  <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
    <p className="text-sm text-green-600">{success}</p>
  </div>
)}

{error && (
  <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
    <p className="text-sm text-red-600">{error}</p>
  </div>
)}
```

### Search Input Pattern

```tsx
<div className="relative">
  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
  <input
    type="text"
    placeholder="Search..."
    value={searchQuery}
    onChange={(e) => setSearchQuery(e.target.value)}
    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
  />
</div>
```

### Table Styling Pattern

```tsx
<div className="overflow-x-auto">
  <table className="w-full">
    <thead className="bg-gray-50">
      <tr>
        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
          Header
        </th>
      </tr>
    </thead>
    <tbody className="divide-y divide-gray-200">
      <tr className="hover:bg-gray-50">
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
          Cell
        </td>
      </tr>
    </tbody>
  </table>
</div>
```

### Stat Card Pattern

**Used in**: Dashboard

```tsx
<div className="bg-white rounded-lg shadow p-6">
  <div className="flex items-center justify-between mb-4">
    <div className="bg-blue-500 p-3 rounded-lg">
      <Icon className="h-6 w-6 text-white" />
    </div>
    <span className="text-sm font-medium text-green-600">+12%</span>
  </div>
  <h3 className="text-sm font-medium text-gray-600 mb-1">Stat Name</h3>
  <p className="text-2xl font-bold text-gray-900">{value}</p>
</div>
```

---

## Development Guidelines

### Before Making Changes

1. **Read this README** - Understand existing patterns
2. **Check Known Issues** - Your "bug" might be a workaround
3. **Review RLS Policies** - Don't break data security
4. **Test with both roles** - Admin and client access
5. **Update this README** - Document changes and decisions

### When Adding Features

1. **Follow existing patterns** - Use established component styles
2. **Maintain RLS** - Add appropriate policies for new tables
3. **Handle loading states** - Always show loading indicators
4. **Error handling** - Display user-friendly error messages
5. **Mobile responsive** - Test on small screens

### Testing Checklist

- [ ] Admin can access feature
- [ ] Client can access feature (if applicable)
- [ ] Unauthenticated users are redirected
- [ ] Loading states display properly
- [ ] Errors are caught and displayed
- [ ] Mobile layout works
- [ ] Dark mode compatible (if applicable)

---

## UI/UX Enhancements (v1.5.0 - November 11, 2025)

### Header and Filter Layout Improvements

**Sync Button Enhancement**:
- **Blue Primary Button Styling** - Sync button now uses brand primary blue color (bg-blue-600) matching other primary action buttons like Create User
- **Header Placement** - Moved from page-level filters to global header, positioned next to theme toggle for consistent access across all pages
- **Sync Timestamp Display** - Added timestamp underneath Sync button showing when data was last synchronized (e.g., "Synced 2 minutes ago")
- **Mobile Optimized** - Text label ("Sync") hidden on mobile screens to save space while maintaining icon visibility
- **Vertical Alignment Fix (v1.5.3)** - Sync button and theme toggle now align at the top with proper padding (pt-3) for enhanced visual balance
- **Top Alignment** - Changed from items-end to items-start alignment for cleaner header appearance
- **Enhanced Spacing (v1.5.4)** - Increased padding below sync timestamp from mb-1 to mb-3 to create more breathing room and visual balance between header elements
- **Consistent Button Design** - Updated padding from px-4 py-2.5 to px-6 py-2 to match primary button pattern throughout the app
- **Improved Top Spacing (v1.5.5)** - Increased top padding from pt-3 to pt-4 for better visual separation and breathing room at the top of the header

**Filter Bar Reorganization**:
- **Phone Numbers Dropdown (v1.5.7)** - Fully functional phone number filter integrated with agent assignments on both Dashboard and Call Logs pages
  - Shows only phone numbers assigned to the selected agent(s)
  - Automatically updates when agent selection changes
  - Formatted display (e.g., "+1 (555) 123-4567") for better readability
  - Filters calls by matching both from_number and to_number fields
  - Supports both direct agent phone assignments and number pool assignments
- **Export CSV Repositioning (v1.5.3)** - Moved Export CSV button to page header area, aligned with "Call Logs" title and description for improved visibility and access
- **Header Button Placement** - Export CSV now appears as a standalone button in the top-right of the page header section
- **Filter Order** - Filters now follow logical workflow: Direction → Date Range → Agent → Phone Numbers → Search
- **Phone Numbers Styling Fix (v1.5.1)** - Updated text color to match other filter elements (text-gray-700/text-gray-300) with proper disabled state styling
- **Date Range Default Text** - Updated date selector to display "All Time" when no date range is selected (previously showed "Select Date Range")
- **Search Bar Width Extension (v1.5.4)** - Removed max-width constraint (max-w-xs) allowing search bar to extend almost to the edge while maintaining existing padding for optimal usability
- **Consistent Styling** - All filter controls maintain unified styling and spacing

**Call Action Tooltips (v1.5.4)**:
- **Enhanced Accessibility** - Call Summary, Call Transcript, and Call Recording icon buttons now have explicit tooltips
- Native HTML title attributes provide hover feedback for better user experience
- Updated tooltip text to match icon purpose: "Call Summary", "Call Transcript", and "Call Recording"
- Color-coded icons with descriptive hover text (blue for summary, green for transcript, purple for recording)
- Dark mode compatible hover states for all action buttons
- **Faster Tooltip Appearance (v1.5.5)** - Custom CSS animation reduces tooltip delay from default to 0.15s for more responsive feedback
- **Improved Readability (v1.5.5)** - Enhanced tooltip styling for better visibility and user experience
- **ARIA Labels Added (v1.5.5)** - Accessibility improvements with aria-label attributes for screen readers

**Responsive Design**:
- Sync button text hidden on mobile (icon only) to maintain compact header
- Export CSV button text hidden on mobile screens to prevent overflow
- Phone Numbers and Agent dropdowns maintain full functionality on mobile with proper touch targets
- All filter controls stack vertically on mobile for better usability

### Dashboard Improvements

**Default Filter Selection**:
- **Inbound Calls Default** - Dashboard now defaults to showing "Inbound" calls instead of "All"
- Provides immediate focus on the most common use case
- Users can still toggle to "Outbound" or "All" as needed

**Agent-Filtered Statistics**:
- **Assigned Agents Only** - Dashboard statistics now only include calls from assigned agents
- When "All Agents" is selected, shows only calls from agents that are assigned to the user
- Prevents inflated metrics from unassigned agent activity
- Ensures accurate representation of user's actual call volume and performance

**Dashboard Data Loading Fix (v1.5.1)**:
- **Fixed Agent Loading Race Condition** - Dashboard now properly waits for agents to load before filtering calls
- Added availableAgents dependency to useEffect to trigger recalculation when agents are loaded
- Prevents Dashboard from showing zero calls when Call Logs displays data correctly
- Only applies agent filtering when availableAgents array is populated

**Auto-Refresh on Sync**:
- Dashboard automatically refreshes when sync completes
- Real-time data updates without manual page refresh
- Seamless user experience across sync operations

---

## UI/UX Enhancements (v1.3.0 - November 11, 2025)

### Dark Mode Implementation

**Full Dark Mode Support** - The application now features a complete dark mode implementation that can be toggled from the header.

**Implementation Details**:
- Enabled `darkMode: 'class'` in Tailwind configuration
- Dark mode preference persists in localStorage
- All components updated with dark mode variants using Tailwind's `dark:` prefix
- Smooth transitions between light and dark modes
- Consistent color scheme across all pages and components

**Color Scheme**:
- **Background**: `bg-gray-900` (dark mode) vs `bg-gray-50` (light mode)
- **Cards**: `bg-gray-800` (dark mode) vs `bg-white` (light mode)
- **Text Primary**: `text-white` (dark mode) vs `text-gray-900` (light mode)
- **Text Secondary**: `text-gray-300/400` (dark mode) vs `text-gray-600` (light mode)
- **Borders**: `border-gray-700` (dark mode) vs `border-gray-200` (light mode)
- **Hover States**: Properly adjusted for visibility in both modes

**Components with Dark Mode**:
- DashboardLayout (sidebar, header, navigation)
- Dashboard page (stats, filters, distribution chart)
- Call Logs page (filters, table, modals, pagination)
- DateRangePicker modal (calendar, inputs, buttons)
- All admin banners and notifications
- **Billing Page (v1.5.5)** - Complete dark mode support for all billing elements including payment model badge, stats cards, transaction history table, and replenish modal
- **Profile Page (v1.5.6)** - Full dark mode compatibility for profile forms, tabs, notifications settings, security forms, and all input fields with proper label visibility

### Call Logs Page Improvements

**Desktop Layout Enhancements**:
- **Select Date Range Button**: Updated to match Inbound/Outbound toggle styling with white background and border
- **Agent Dropdown**: Increased width to `w-48` (192px) for better readability
- **Search Bar**: Optimized width with `max-w-xs` constraint for balanced layout
- **Filter Layout**: Improved spacing and alignment of all filter controls

**Mobile Responsive Design**:
- **Sync Now Button**: Reduced padding (`px-3 py-2` on mobile vs `px-4 py-2` on desktop) and text size for better fit
- **Filter Stacking**: Filters now stack vertically on mobile with full width (`w-full`) for touch-friendly interaction
- **Agent Dropdown & Search Bar**: Equal widths on mobile for visual consistency
- **Table**: Horizontally scrollable on small screens to maintain data integrity

### Dashboard Page Enhancements

**Removed Elements**:
- **Fake Percentage Indicators**: Removed "+12%", "+8%", "+3%", "+15%" placeholders from stat cards
- **Quick Actions Section**: Removed redundant Quick Actions card (functionality accessible via sidebar navigation)

**Added Filtering Capabilities**:
- **Direction Toggle**: Filter by All/Inbound/Outbound calls with pill-style toggle buttons
- **Date Range Picker**: Integrated DateRangePicker component for custom date filtering
- **Agent Dropdown**: Filter statistics by specific agent or view all agents
- **Real-time Updates**: Dashboard stats update automatically when filters are applied

**Stat Cards**:
- Simplified layout with icon only (removed percentage indicators)
- Better visual hierarchy focusing on the actual metrics
- Maintained color-coded icons for quick recognition

### Header Improvements

**Removed Refresh Button**: Eliminated the dedicated refresh button next to the dark mode toggle as users can refresh via browser controls. This creates a cleaner, less cluttered header.

### Mobile and Tablet Responsiveness

**Comprehensive Responsive Design**:
- All pages tested and optimized for mobile (320px+) and tablet (768px+) viewports
- Proper use of Tailwind breakpoints: `sm:`, `md:`, `lg:`
- Touch-friendly button sizes and tap targets
- Stacked layouts on mobile for better readability
- Horizontal scrolling for tables to prevent data loss
- Responsive typography and spacing adjustments

**Layout Patterns**:
```tsx
// Filter controls - mobile stacking
<div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-4">

// Full width on mobile, fixed width on desktop
<select className="w-full sm:w-48 ...">

// Smaller button on mobile
<button className="px-3 py-2 sm:px-4 sm:py-2 text-sm sm:text-base ...">
```

### Visual Consistency

**Unified Design System**:
- Consistent button styling across all pages (Select Date Range matches filter buttons)
- Uniform spacing and gap patterns
- Standardized dark mode color application
- Cohesive transition animations
- Proper contrast ratios for accessibility in both light and dark modes

**Before/After Summary**:
- ✅ Dark mode toggle now functional with proper theme switching
- ✅ Call Logs filters properly sized and responsive
- ✅ Dashboard shows real data without fake metrics
- ✅ Dashboard includes powerful filtering options
- ✅ Mobile experience significantly improved
- ✅ Cleaner header without redundant refresh button
- ✅ All components maintain brand consistency

---

## Recent Enhancements (v1.2.0 - November 11, 2025)

### ✅ Call Recording Playback
- **Inline Audio Player** - Stream recordings directly in the dashboard
- **Edge Function Proxy** - Secure recording access via `get-call-recording` function
- **Recording Icon** - Purple volume icon indicates available recordings
- **Modal Player** - Clean interface with call details and audio controls
- **OAuth Integration** - Uses user's HighLevel token for authenticated access

**Implementation**:
- Added `message_id` and `location_id` columns to `calls` table
- Created `get-call-recording` edge function to proxy authenticated requests
- Updated OAuth scopes to include `conversations.readonly` and `conversations/message.readonly`

**Files**:
- `supabase/functions/get-call-recording/index.ts` - Recording proxy endpoint
- `supabase/migrations/20251111040000_add_message_id_for_recordings.sql` - Database schema
- `src/pages/CallsPage.tsx` - Recording player UI
- `src/pages/AdminCallsAnalytics.tsx` - Admin recording access

### ✅ Enhanced UI/UX
- **Contact Name Formatting** - Auto-converts names to proper title case (John Doe instead of JOHN DOE)
- **Improved Date Picker** - Simplified single-month calendar with cleaner, more intuitive design
- **Inline Sync Notifications** - Replaced disruptive browser alerts with dismissible inline success messages
- **Better Visual Feedback** - Color-coded action buttons (blue for summary, green for transcript, purple for recording)

**Files**:
- `src/utils/formatting.ts` - Text formatting utilities (title case conversion)
- `src/components/DateRangePicker.tsx` - Redesigned calendar component

---

## Stripe Billing System (v2.0.0 - November 11, 2025)

### Overview
Complete Stripe-backed billing system with three plan types (Pay Per Use, Unlimited, Complimentary) and dynamic inline pricing.

### Billing Plans

**Pay Per Use (PPU)** - Wallet-based with monthly invoicing on the 1st
**Unlimited** - $500/month fixed subscription with immediate charge
**Complimentary** - Free accounts with zero-cost tracking (admin-only)

### Key Features
- Dynamic per-user rate configuration (stored in cents, not Stripe)
- Wallet system with non-expiring credits
- 7-day grace period on payment failures
- Inline Stripe invoicing (no pre-created Prices needed for PPU)
- Complete audit trail for all wallet transactions
- Per-call usage tracking with rate at time of call

### Files Created
- `src/services/stripe.ts` - Stripe integration with dynamic pricing
- `src/services/billingEngine.ts` - Billing calculations and wallet management
- `supabase/functions/stripe-webhook/index.ts` - Webhook handler
- `supabase/migrations/20251111215019_add_stripe_billing_system.sql` - Database schema

### Environment Variables Required
```
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
VITE_STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
VITE_STRIPE_UNLIMITED_PRICE_ID=price_... (create $500/month product in Stripe)
```

### Setup Steps
1. Create Stripe account and get API keys
2. Create Unlimited plan product ($500/month) in Stripe Dashboard
3. Configure webhook endpoint: `https://your-project.supabase.co/functions/v1/stripe-webhook`
4. Add webhook events: `checkout.session.completed`, `invoice.*`, `customer.subscription.*`
5. Enable Stripe Customer Portal for plan switching
6. Run database migration to add new schema
7. Deploy stripe-webhook edge function

### Admin Controls
- Set billing plan (PPU/Unlimited/Complimentary) per user
- Configure custom rate_per_minute_cents for each PPU user
- Manually add/deduct wallet credits with audit trail
- View complete transaction history

### User Experience
- **PPU**: See rate, wallet, monthly stats, add funds, upgrade option
- **Unlimited**: See plan/price, next payment, manage payment methods
- **Complimentary**: See plan indication, no billing UI

For detailed documentation, see inline comments in migration file and service modules.

---

## Future Enhancements

### Planned Features
- [ ] Logo and favicon integration
- [ ] Automated call syncing (scheduled)
- [ ] Webhook receiver for real-time call updates
- [ ] Advanced analytics and reporting
- [✓] Stripe integration for billing (COMPLETED v2.0.0)
- [ ] Email notifications for billing events
- [✓] Configurable cost-per-minute rates (COMPLETED v2.0.0)
- [ ] Multi-tenant agency support
- [ ] Scheduled billing tasks edge function (auto-process monthly PPU)

### Technical Debt
- [ ] Move OAuth token exchange to Edge Function (security)
- [ ] Implement rate limiting for HighLevel API calls
- [ ] Add request caching for repeated API calls
- [ ] Optimize RLS policies for performance
- [ ] Add database indexes for common queries
- [ ] Implement comprehensive error logging service
- [ ] Add unit tests for critical functions
- [ ] Create admin documentation/help system
- [ ] Complete BillingPage UI update for new schema
- [ ] Integrate Stripe Checkout in BillingPage

---

## Support & Documentation

### Project Structure
```
voice-ai-dash/
├── src/
│   ├── components/       # Reusable UI components
│   ├── contexts/         # React context providers
│   ├── lib/             # Supabase client setup
│   ├── pages/           # Route components
│   ├── services/        # Business logic (OAuth, HighLevel)
│   └── main.tsx         # App entry point
├── supabase/
│   ├── functions/       # Edge Functions (OAuth endpoints)
│   └── migrations/      # Database migrations
└── README.md           # This file
```

### Key Files Reference

| File | Purpose |
|------|---------|
| `src/services/oauth.ts` | OAuth flow, token management |
| `src/services/highlevel.ts` | HighLevel API integration |
| `src/contexts/AuthContext.tsx` | Authentication state |
| `src/components/DashboardLayout.tsx` | Main layout, navigation |
| `src/pages/AdminUsersPage.tsx` | User management, OAuth, agents |
| `src/pages/Dashboard.tsx` | Statistics and metrics |
| `supabase/migrations/20251110203230_*.sql` | Initial schema |
| `supabase/migrations/20251111005733_*.sql` | RLS fixes |

---

**End of Documentation**

Last Updated: November 11, 2025
Maintained by: Development Team
For questions or updates: Please update this README when making significant changes

---

## Admin Dashboard Enhancements (v1.1.0)

### New Admin Features

#### User Management Enhancements

**1. Create User**
- Admins can manually create user accounts with email, password, and profile details
- Automatically creates associated billing account
- Supports role assignment (client or admin)
- Component: `src/components/admin/CreateUserModal.tsx`

**2. Send Registration Invitations**
- Generate unique invitation links with expiration dates
- Customizable expiration periods (1-30 days)
- Track invitation status (pending, accepted, expired, revoked)
- Copy invitation link to clipboard functionality
- Component: `src/components/admin/InviteUserModal.tsx`
- Database: `user_invitations` table

**3. Bulk Operations**
- Select multiple users for bulk actions
- Bulk assign agents to multiple users simultaneously
- Bulk assign phone numbers to multiple users
- Progress tracking and error reporting
- Component: `src/components/admin/BulkOperationsModal.tsx`

**4. User Suspension/Activation**
- Suspend or activate user accounts
- Preserves data while preventing login
- Audit logging for all suspension actions
- Visual indicators for suspended accounts

**5. Active Session Monitoring**
- View all active sessions for any user
- Display device type, browser, OS, location, and IP address
- Last activity timestamps
- Terminate sessions remotely
- Component: `src/components/admin/UserSessionsModal.tsx`
- Database: `active_sessions` table

**6. Billing Configuration**
- Set payment model (Flat Fee or Pay Per Use)
- Custom cost-per-minute pricing overrides
- Admin notes for billing arrangements
- View current wallet balance and fees
- Component: `src/components/admin/BillingConfigModal.tsx`

**7. Phone Number Assignment**
- Assign phone numbers to users
- Visual indicators for users with assigned phone numbers
- Bulk phone number assignment support

**8. User Status Indicators**
- Last login timestamps with relative formatting
- HL Connected badge (HighLevel connection status)
- Agent badge (assigned agents)
- Phone badge (assigned phone numbers)
- Suspended status badge

#### Call Analytics Dashboard

**Location**: `/admin/calls`
**Component**: `src/pages/AdminCallsAnalytics.tsx`

**Global Filters**:
- User selector (all users or specific user)
- Agent selector (all agents or specific agent)
- Direction toggle (all/inbound/outbound)
- Date range selector with presets:
  - Today
  - Last 7 Days
  - Last 30 Days
  - Custom Date Range
- Keyword search (contact, phone, action, transcript)

**Metrics Displayed**:
- Total Calls (with inbound/outbound breakdown)
- Actions Triggered (with success rate percentage)
- Average Duration (with total duration)
- Total Cost (with average cost per call)

**Call Details Table**:
- Contact name and phone number
- User association
- Direction badge (color-coded)
- Date and time
- Duration (mm:ss format)
- Status (for outbound calls)
- Cost per call
- Quick actions: Summary, Transcript, Recording, Notes

**Export Features**:
- CSV export with all filtered data
- Includes user information, costs, and call details

#### System Health Monitoring

**Location**: `/admin/config` → System Health Tab
**Enhanced Component**: `src/pages/AdminConfigPage.tsx`

**Health Metrics**:
- Total Users (with active user count)
- HighLevel Connections (total and active)
- Sync Status (healthy or failed count)
- Last sync timestamp

**Visual Indicators**:
- Color-coded status cards (green for healthy, red for issues)
- Real-time refresh functionality
- Alert icons for failed syncs

#### Enhanced Audit Logs

**Filtering Capabilities**:
- Filter by action type (create user, suspend, invite, billing updates, bulk operations)
- Date range filtering (start and end dates)
- Admin user filtering (future enhancement)
- Real-time refresh

**Tracked Actions**:
- `create_user` - Manual user account creation
- `suspend_user` / `unsuspend_user` - Account suspension changes
- `invite_user` - Registration invitation sent
- `update_billing_model` - Billing configuration changes
- `bulk_assign_agents` - Bulk agent assignments
- `bulk_assign_phone_numbers` - Bulk phone assignments

### New Database Tables

**user_invitations**:
- Tracks registration invite links
- Fields: email, invitation_token, role, status, expires_at, accepted_at
- Indexes: invitation_token, email, status

**active_sessions**:
- Tracks user login sessions
- Fields: user_id, ip_address, user_agent, device_type, browser, os, location
- Indexes: user_id, last_activity_at

**Enhanced billing_accounts**:
- Added `custom_cost_per_minute` for per-user pricing
- Added `admin_notes` for internal billing notes

**Enhanced user_phone_numbers**:
- Added `assigned_by` to track which admin assigned the phone number

### New Services

**Admin Service** (`src/services/admin.ts`):
- `createUserInvitation()` - Generate invitation links
- `acceptInvitation()` - Process invitation acceptance
- `createUser()` - Manual user creation
- `suspendUser()` - Suspend/unsuspend accounts
- `bulkAssignAgents()` - Bulk agent assignment
- `bulkAssignPhoneNumbers()` - Bulk phone assignment
- `getUserSessions()` - Fetch user sessions
- `terminateSession()` - End specific session
- `updateBillingModel()` - Configure billing
- `getSystemHealth()` - System health metrics
- `getAuditLogs()` - Filtered audit log retrieval

### UI/UX Enhancements

**Selection Mode**:
- Checkbox selection for users
- Select All / Deselect All functionality
- Selected count indicator
- Bulk action button appears when users are selected

**Modal Consistency**:
- All modals follow the same design pattern
- Proper loading states
- Error handling with user-friendly messages
- Confirmation dialogs for destructive actions

**Status Indicators**:
- Color-coded badges for all statuses
- Consistent badge styling across the application
- Tooltips for icon-only actions

**Navigation**:
- New "Call Analytics" menu item for admins
- Icon: `BarChart3`
- Located between "Call Logs" and "Users"

### Security Considerations

**Row Level Security (RLS)**:
- All new tables have RLS enabled
- Admin-only access for user_invitations and system views
- Users can view their own sessions
- Admins have full access to all data

**Audit Logging**:
- All admin actions are logged automatically
- Includes target user, action type, and metadata
- Immutable audit trail
- Used for compliance and security monitoring

**Token Security**:
- Invitation tokens are 64-character hex strings
- Cryptographically secure random generation
- Time-limited expiration
- One-time use tokens

### Performance Optimizations

**Indexes**:
- Added indexes on frequently queried columns
- Optimized call log queries by user_id, direction, and date
- Improved audit log retrieval performance

**Batch Operations**:
- Bulk assignments use upsert with conflict resolution
- Parallel processing for user status checks
- Progress tracking prevents UI blocking

### Migration Information

**Migration File**: `supabase/migrations/20251111020000_add_admin_enhancements.sql`

**Applied Changes**:
- Created user_invitations table with RLS policies
- Created active_sessions table with RLS policies
- Added custom billing fields to billing_accounts
- Enhanced user_phone_numbers with assignment tracking
- Created performance indexes
- Added helper functions: `cleanup_expired_invitations()`, `log_admin_action()`

### Future Enhancements

**Planned Features**:
- Email notifications for invitations (currently copy-link only)
- Bulk user import via CSV
- Custom role permissions beyond admin/client
- Advanced analytics with charts and graphs
- Real-time session monitoring with WebSocket updates
- Automated session cleanup for expired sessions
- Custom billing plans with feature toggles
- User activity timeline view

**Known Limitations**:
- Invitation links must be manually shared (no email integration yet)
- Session tracking requires manual implementation in auth flow
- Bulk operations limited to 100 items at a time
- Call analytics shows maximum 50 calls in table (pagination recommended)

---

## Billing Page Design

### Overview

The Billing page (`src/pages/BillingPage.tsx`) provides a comprehensive, plan-aware billing interface that dynamically displays relevant information based on the user's subscription type: Pay Per Use, Unlimited, or Complimentary.

### Design Principles

**Plan-Specific UI**: The billing page adapts its layout and displays different metric tiles based on the user's billing plan, ensuring users only see information relevant to their subscription type.

**Flexible Grid System**: Metric tiles use `grid-template-columns: repeat(auto-fit, minmax(250px, 1fr))` to automatically fill the entire width regardless of the number of tiles displayed.

**Transaction Consistency**: All transaction type badges MUST use ALL CAPS (e.g., "TOP UP", "ADMIN CREDIT") for visual consistency across the application.

### Metric Tiles

#### Service Plan Tile (All Plans)
- **Icon**: `Package` (blue)
- **Displays**:
  - Plan type: "Unlimited", "Pay Per Use", or "Complimentary"
  - Pricing: "$500/month", "$X.XX/minute", or "Free"
- **Additional Features**:
  - "Upgrade to Unlimited" button for Pay Per Use users

#### Wallet Balance Tile (Pay Per Use Only)
- **Icon**: `Wallet` (green)
- **Displays**:
  - Current wallet balance in dollars
  - "Add Funds" button
  - Low balance warning (< $10.00)

#### Current Balance Tile (Pay Per Use Only)
- **Icon**: `Activity` (purple)
- **Displays**:
  - Current month's usage-based charges
  - "Based on usage" helper text
- **Data Source**: `month_spent_cents` from `billing_accounts`

#### Account Status Tile (Unlimited Only)
- **Icon**: `Shield` (green for good standing, red for past due)
- **Displays**:
  - Status: "Good Standing" or "Past Due"
  - Next payment date or subscription status

### Past Due Warning

For Unlimited plan users who are past due:
- **Banner Type**: Red alert banner
- **Trigger**: When `grace_until` date has passed
- **Message Format**: "Payment is required by [date] to avoid service interruption"
- **Calculation**: grace_until + 7 days = final payment date
- **Purpose**: Provides clear deadline before automated service suspension

### Stripe Customer Portal Integration

**Access Button**:
- Location: Below metric tiles, aligned right
- Button Text: "Manage Payment Methods"
- Icon: `ExternalLink`
- Visibility: Only shown when user has Stripe customer ID

**Functionality**:
- Redirects to Stripe's hosted billing portal
- Allows users to:
  - Update payment methods
  - View invoice history
  - Manage subscriptions
  - Download receipts

**Edge Function**: `supabase/functions/stripe-portal/index.ts` creates the portal session

### Transaction History

**Table Columns**:
1. **Date**: Display format "MMM d, yyyy" with time "h:mm a"
2. **Type**: Badge with ALL CAPS text (TOP UP, DEDUCTION, ADMIN CREDIT, ADMIN DEBIT, REFUND)
3. **Reason**: Transaction description
4. **Amount**: Prefixed with + or - and color-coded (green for credits, red for debits)

**Removed Column**: The "Balance" column has been removed to simplify the transaction display.

**Export Functionality**: CSV export includes Date, Type, Reason, Amount (without Balance column)

**Future Enhancement**: Transaction history will include monthly subscription payments from the `billing_invoices` table for a comprehensive payment history.

### Automated Number Unassignment

**Purpose**: Automatically unassign phone numbers from agents when accounts are 10+ days past their grace period.

**Database Functions**:
- `unassign_user_phone_numbers(user_id)`: Clears phone assignments for all user's agents
- `process_past_due_accounts()`: Identifies and processes accounts 10+ days past due

**Implementation**:
- Edge Function: `supabase/functions/process-past-due-accounts/index.ts`
- Can be triggered via cron job or manual API call
- Logs all actions in `audit_logs` table for accountability

**Agent Updates**:
- Sets `inbound_phone_number` to NULL
- Sets `highlevel_number_pool_id` to NULL
- Removes all entries from `agent_phone_numbers` junction table

**Migration**: `supabase/migrations/20251112120000_enhance_billing_status_tracking.sql`

### Color Scheme

The billing page maintains consistency with the app's color palette:

- **Blue** (`bg-blue-600`): Primary actions, Service Plan tile icon
- **Green** (`bg-green-600`): Wallet Balance, success states, "Good Standing" status
- **Red** (`bg-red-600`): Past due warnings, deductions
- **Purple** (`bg-purple-600`): Usage-based billing metrics
- **Orange** (`text-orange-600`): Low balance warnings
- **Gray**: Neutral backgrounds and text

### Responsive Design

The billing page uses a responsive grid system that:
- Automatically adjusts tile layout based on screen width
- Maintains consistent spacing between tiles (gap-6)
- Ensures tiles fill the entire row width
- Supports mobile, tablet, and desktop viewports

### Edge Functions

#### stripe-portal
- **Purpose**: Creates Stripe Customer Portal sessions
- **Location**: `supabase/functions/stripe-portal/index.ts`
- **Parameters**: `userId`, `returnUrl`
- **Returns**: Portal session URL for redirect

#### process-past-due-accounts
- **Purpose**: Automates number unassignment for overdue accounts
- **Location**: `supabase/functions/process-past-due-accounts/index.ts`
- **Trigger**: Scheduled cron job (recommended daily)
- **Returns**: Summary of processed accounts

---

