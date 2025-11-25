# Retell AI Integration Plan

## Overview

Add Retell AI as a second voice provider alongside HighLevel. Users can connect both providers simultaneously. This document outlines the technical integration plan.

---

## 1. Current Architecture Summary

### HighLevel Integration Pattern
| Layer | Component | Purpose |
|-------|-----------|---------|
| Auth | OAuth 2.0 | Token refresh required, location-scoped |
| Frontend | `src/services/oauth.ts` | OAuth flow, token management |
| Frontend | `src/services/highlevel.ts` | Call sync orchestration, agent management |
| Edge Function | `sync-highlevel-calls` | Fetches calls from HighLevel API |
| Edge Function | `fetch-available-agents` | Lists agents from HighLevel |
| Edge Function | `get-call-recording` | Proxies recording audio |
| Storage | `api_keys` table | OAuth tokens with `service='highlevel'` |

### Key Database Tables
- `agents` — already has `source_platform` column (default `'highlevel'`)
- `user_agents` — junction table linking users to agents
- `calls` — call records with `highlevel_call_id`
- `api_keys` — OAuth tokens, keyed by `user_id` and `service`

---

## 2. Retell AI API Capabilities

### Authentication
- **Simple API Key** (no OAuth)
- Format: `Authorization: Bearer YOUR_API_KEY`
- Keys are **workspace-scoped** (no location concept)
- Keys don't expire — manual revocation only

### Core Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/list-agents` | GET | List all agents (max 1000, paginated) |
| `/get-agent/{id}` | GET | Get single agent details |
| `/v2/list-calls` | POST | List calls with filters (max 1000, paginated) |
| `/v2/get-call/{id}` | GET | Get single call with full details |

### Call Data Fields (from API)
- `call_id`, `agent_id`, `agent_name`
- `call_status`: `registered`, `not_connected`, `ongoing`, `ended`, `error`
- `call_type`: `web_call` or `phone_call`
- `direction`: `inbound` or `outbound` (phone calls only)
- `start_timestamp`, `end_timestamp`, `duration_ms` (milliseconds)
- `transcript` (string format)
- `transcript_object` (structured with word-level timestamps)
- `recording_url` (direct S3 URL)
- `call_analysis`: summary, sentiment, success status
- `disconnection_reason`: detailed enum (30+ values)
- `latency`: e2e, llm, tts latency metrics

### Agent Data Fields
- `agent_id`, `agent_name`
- `voice_id`, `voice_model`, `voice_speed`
- `language`, `responsiveness`
- `webhook_url` (per-agent webhook configuration)
- `response_engine` (LLM configuration)
- `is_published`, `version`

### Webhooks
- **Events**: `call_started`, `call_ended`, `call_analyzed`
- **Signature verification**: Use `x-retell-signature` header with API key
- **SDK helper**: `Retell.verify(body, apiKey, signature)`
- **Timeout**: 10 seconds, retries up to 3 times
- **IP allowlist**: `100.20.5.228`

---

## 3. Key Differences: HighLevel vs Retell AI

| Aspect | HighLevel | Retell AI |
|--------|-----------|-----------|
| **Auth** | OAuth 2.0 (token refresh required) | Static API Key |
| **Scoping** | Location-based (`location_id`) | Workspace-based (no location) |
| **Token Expiry** | Tokens expire, need refresh | API keys don't expire |
| **Recordings** | Requires proxy through Conversations API | Direct S3 URLs |
| **Transcripts** | May require separate fetch | Included in call object |
| **Call Analysis** | Not included | Built-in: sentiment, summary, success |
| **Duration** | Seconds | Milliseconds |
| **Webhook Setup** | Not used currently | Per-agent `webhook_url` or account-level |
| **Rate Limits** | Documented | Not documented (needs testing) |

---

## 4. Database Schema Changes

### Migration: Add Retell Support

```sql
-- 1. Add source_platform to user_agents (track which provider each assignment is for)
ALTER TABLE user_agents 
ADD COLUMN source_platform text DEFAULT 'highlevel' NOT NULL;

-- 2. Add retell_agent_id to agents (parallel to highlevel_agent_id)
ALTER TABLE agents 
ADD COLUMN retell_agent_id text UNIQUE;

-- 3. Add retell columns to calls
ALTER TABLE calls
ADD COLUMN retell_call_id text UNIQUE,
ADD COLUMN source_platform text DEFAULT 'highlevel' NOT NULL;

-- 4. Create indexes
CREATE INDEX idx_calls_source_platform ON calls(source_platform);
CREATE INDEX idx_calls_retell_call_id ON calls(retell_call_id);
CREATE INDEX idx_user_agents_source_platform ON user_agents(source_platform);
CREATE INDEX idx_agents_retell_agent_id ON agents(retell_agent_id);
```

### api_keys Table Usage for Retell

Store Retell API keys using existing table structure:

| Field | HighLevel Value | Retell Value |
|-------|-----------------|--------------|
| `service` | `'highlevel'` | `'retell'` |
| `access_token` | OAuth access token | Retell API key |
| `refresh_token` | OAuth refresh token | `null` |
| `token_expires_at` | Expiry timestamp | `null` |
| `location_id` | HighLevel location | `null` |
| `is_active` | `true`/`false` | `true`/`false` |

---

## 5. Edge Functions

### New Functions Required

| Function | Purpose | Retell Endpoint |
|----------|---------|-----------------|
| `sync-retell-calls` | Fetch and sync calls | `POST /v2/list-calls` |
| `fetch-retell-agents` | List available agents | `GET /list-agents` |
| `retell-webhook` | Receive real-time call events | N/A (webhook receiver) |

### sync-retell-calls

**Trigger**: Daily scheduled GitHub Action + manual sync button

**Logic**:
1. Get users with active Retell connections (`api_keys.service = 'retell'`)
2. For each user, fetch calls since last sync (use `start_timestamp` filter)
3. Calculate cost from `duration_ms` using existing billing logic (ignore Retell's `call_cost`)
4. Upsert to `calls` table with `source_platform = 'retell'`

**Pagination**: Use `pagination_key` (call_id of last result) when > 1000 calls

### retell-webhook

**Endpoint**: `https://pjlrcchptrkymevoiolu.supabase.co/functions/v1/retell-webhook`

**Events handled**:
- `call_ended` — insert/update call immediately
- `call_analyzed` — update call with analysis data (summary, sentiment)

**Signature verification**:
```typescript
import { Retell } from 'retell-sdk';

const isValid = Retell.verify(
  JSON.stringify(body),
  apiKey, // from api_keys table
  request.headers.get('x-retell-signature')
);
```

**Challenge**: Need to identify which user's API key to use for verification. Options:
1. Store API key hash in webhook URL path: `/retell-webhook/{user_id}`
2. Look up user by `agent_id` from webhook payload (requires `user_agents` join)

### No Recording Proxy Needed

Retell provides direct `recording_url` (S3 URLs). Unlike HighLevel, no proxy Edge Function required.

**Note**: If `opt_in_signed_url` is enabled on agent, URLs expire after 24 hours. Consider:
- Storing recordings in own S3/Supabase Storage
- Re-fetching URL via `GET /v2/get-call/{id}` when needed

---

## 6. Frontend Changes

### New Service: src/services/retell.ts

```typescript
// Key methods:
saveApiKey(userId: string, apiKey: string): Promise<void>
testConnection(apiKey: string): Promise<boolean>  // calls /list-agents
removeConnection(userId: string): Promise<void>
syncCalls(userId: string): Promise<SyncResult>
getAgents(apiKey: string): Promise<RetellAgent[]>
```

### UserDetailsPage.tsx (Admin)

Add "Retell AI Connection" section under API tab:
- API Key input field
- "Test & Save" button (validates key via `/list-agents`)
- Connection status display
- "Disconnect" button
- "Fetch Agents" button → opens agent assignment modal filtered by `source_platform = 'retell'`

### Agent Management Modal

- Show `source_platform` badge on each agent (HighLevel / Retell)
- Filter agents by platform when fetching
- Include `source_platform` when inserting to `user_agents`

### CallsPage.tsx and Dashboard.tsx

- Add source platform filter dropdown
- Show platform badge/icon on call rows
- White-label: Use generic terms ("Provider A" / "Provider B") on client pages; "HighLevel" / "Retell" on admin pages

### SyncContext.tsx

Update to trigger both provider syncs:
```typescript
const syncAll = async () => {
  const connections = await getUserConnections(userId);
  if (connections.highlevel) await syncHighLevelCalls();
  if (connections.retell) await syncRetellCalls();
};
```

---

## 7. Sync Strategy

### Real-Time (Webhook)
- Retell webhook receives `call_ended` and `call_analyzed` events
- Immediately inserts/updates call in database
- Provides instant updates without polling

### Daily Backup (Scheduled)
- GitHub Action runs daily (similar to existing HighLevel patterns)
- Calls `sync-retell-calls` for all active Retell connections
- Catches any missed webhook deliveries

### Manual Sync
- User clicks sync button in dashboard
- Triggers both HighLevel and Retell syncs based on active connections

---

## 8. Billing Integration

### Cost Calculation

**Decision**: Use call duration only (ignore Retell's `call_cost`)

**Reason**: Consistent billing logic across providers using existing `billingEngine.ts`

**Implementation**:
```typescript
// Convert Retell duration_ms to seconds
const durationSeconds = Math.ceil(call.duration_ms / 1000);

// Apply existing per-minute rates from billing_accounts
const cost = calculateCallCost(durationSeconds, direction, userBillingAccount);
```

---

## 9. Challenges and Mitigations

### 1. Webhook User Identification

**Challenge**: Webhook payload includes `agent_id` but not user identifier. Need to map to correct user.

**Mitigation**: 
- Look up user via `user_agents` table: `agent_id` → `agents.id` → `user_agents.user_id`
- Require agents to be assigned before calls are tracked

### 2. Multi-Provider Agent Assignment

**Challenge**: Same user may have agents from both providers.

**Mitigation**:
- `user_agents.source_platform` column distinguishes assignments
- Agent management UI shows platform badge and allows filtering

### 3. Recording URL Expiration

**Challenge**: Signed S3 URLs expire after 24 hours if `opt_in_signed_url` is enabled.

**Mitigation Options**:
- Re-fetch call via API when recording is requested (adds latency)
- Store recordings in Supabase Storage (adds storage costs)
- Accept expiration as limitation (admin can re-sync to refresh)

### 4. API Key Security

**Challenge**: API keys don't expire like OAuth tokens. If compromised, manual revocation required.

**Mitigation**:
- Encrypt at rest in database
- Log API key usage
- Provide clear instructions for key regeneration in Retell dashboard

### 5. No Location Concept

**Challenge**: HighLevel uses `location_id` for scoping. Retell is workspace-only.

**Mitigation**: 
- `location_id` column remains null for Retell connections
- Update any queries that assume `location_id` is always present

### 6. Web Call Type

**Challenge**: Retell has `web_call` type (WebRTC-based) not present in HighLevel.

**Mitigation**:
- Store `call_type` in calls table metadata
- Display differently in UI if needed (browser icon vs phone icon)

### 7. Duration Units

**Challenge**: HighLevel uses seconds, Retell uses milliseconds.

**Mitigation**: Normalize to seconds when storing in `calls` table.

### 8. Rate Limits

**Challenge**: Retell rate limits not documented.

**Mitigation**: 
- Implement exponential backoff in sync functions
- Monitor for 429 responses and adjust accordingly

---

## 10. Implementation Phases

### Phase 1: Database & Core Infrastructure
1. Create migration for schema changes
2. Create `sync-retell-calls` Edge Function
3. Create `fetch-retell-agents` Edge Function
4. Create `src/services/retell.ts`

### Phase 2: Admin UI
1. Add Retell connection section to `UserDetailsPage.tsx`
2. Update agent management modal with platform filter
3. Add platform badge to agent lists

### Phase 3: Call Display
1. Add `source_platform` filter to `CallsPage.tsx`
2. Add platform indicator to call rows
3. Update `Dashboard.tsx` stats to include platform breakdown

### Phase 4: Real-Time Sync
1. Create `retell-webhook` Edge Function
2. Implement signature verification
3. Document webhook setup for admins

### Phase 5: Scheduled Sync
1. Add daily GitHub Action for `sync-retell-calls`
2. Integrate with existing sync monitoring

---

## 11. Webhook Setup Documentation

### For Admins

1. Connect user's Retell API key via Admin > Users > [User] > API tab
2. Assign Retell agents to user
3. In Retell dashboard, configure webhook URL for each agent:
   ```
   https://pjlrcchptrkymevoiolu.supabase.co/functions/v1/retell-webhook
   ```
4. Alternatively, set account-level webhook in Retell dashboard settings

### Webhook IP Allowlist

If firewall rules needed: `100.20.5.228`

---

## 12. Environment Variables

### New Variables Required

```env
# None required - Retell uses per-user API keys stored in database
# Unlike HighLevel OAuth, no app-level client credentials needed
```

---

## 13. Testing Checklist

- [ ] API key validation via `/list-agents`
- [ ] Agent fetch and assignment
- [ ] Call sync (initial and incremental)
- [ ] Webhook signature verification
- [ ] Webhook call insertion
- [ ] Recording URL access
- [ ] Platform filter on calls page
- [ ] Billing cost calculation from duration
- [ ] Multi-provider user (HighLevel + Retell)
- [ ] Daily scheduled sync execution

---

## 14. White-Label Compliance

### Admin Pages (Retell naming allowed)
- `UserDetailsPage.tsx` — "Retell AI Connection"
- `AdminUsersPage.tsx` — "Retell" in platform indicators
- Edge Functions — internal naming

### Client Pages (generic terms only)
- `CallsPage.tsx` — "Provider" or icon-only
- `Dashboard.tsx` — "Provider A" / "Provider B" or icons
- `ProfilePage.tsx` — "Voice AI Connection" (if exposed)

---

## Summary

Retell AI integration is simpler than HighLevel due to static API keys (no OAuth) and richer call data (transcripts, analysis included). Main complexities are:

1. **Webhook user mapping** — requires agent assignment before calls can be tracked
2. **Multi-provider UX** — need clear platform indicators throughout UI
3. **Recording expiration** — signed URLs expire after 24 hours

The integration fits well into existing architecture patterns, reusing `api_keys` table, billing engine, and sync context.
