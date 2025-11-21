# OAuth Integration and Sync Explanation

## Why OAuth Credentials Are Needed

### Historical Context

**Before (Old System):**
- Users entered API keys directly
- Simple authentication
- No location-based permissions

**Current (OAuth 2.0 System):**
- OAuth 2.0 authorization flow
- Location-specific permissions
- Refresh token support
- Better security model

### OAuth Flow Requirements

The sync functionality requires THREE components to work:

1. **Client ID** (`VITE_HIGHLEVEL_CLIENT_ID`)
   - Identifies your application to HighLevel
   - Public identifier (safe to expose)

2. **Client Secret** (`VITE_HIGHLEVEL_CLIENT_SECRET`)
   - Authenticates your application to HighLevel
   - Private key (should be server-side only)

3. **Access Token** (per user, stored in database)
   - Obtained through OAuth flow
   - User-specific authorization
   - Automatically refreshed when expired

### Why Sync Worked "Yesterday"

If syncing worked yesterday but not today, possible causes:

1. **OAuth Connection Was Revoked**
   - User disconnected in HighLevel dashboard
   - Tokens were deleted from database
   - Need to reconnect via Admin Users page

2. **Token Expired and Refresh Failed**
   - Access tokens expire (typically 24 hours)
   - Refresh token may be invalid
   - Automatic refresh mechanism failed

3. **Scope Changes**
   - HighLevel API requirements changed
   - Missing required scopes for voice-ai-dashboard.readonly
   - Need to re-authorize with new scopes

4. **Environment Variables Changed**
   - Client ID or Client Secret were modified
   - Redirect URI mismatch
   - Token URL or Auth URL incorrect

## Current Configuration Status

Your `.env` file shows:

```
VITE_HIGHLEVEL_CLIENT_ID=69125781544df54f39aaee49-mhtrgdiz
VITE_HIGHLEVEL_CLIENT_SECRET=963a38ca-a6e4-40bf-adc9-62f88363b448
VITE_HIGHLEVEL_REDIRECT_URI=https://www.voiceaidash.app/oauth/callback
VITE_HIGHLEVEL_AUTH_URL=https://marketplace.gohighlevel.com/oauth/chooselocation
VITE_HIGHLEVEL_TOKEN_URL=https://services.leadconnectorhq.com/oauth/token
VITE_HIGHLEVEL_API_URL=https://services.leadconnectorhq.com
```

✅ All OAuth configuration variables are present and appear valid.

## Required OAuth Scopes

The following scopes are needed for full functionality:

```
voice-ai-agents.readonly
voice-ai-agents.write
voice-ai-dashboard.readonly
voice-ai-agent-goals.readonly
voice-ai-agent-goals.write
contacts.readonly
locations.readonly
conversations.readonly
conversations/message.readonly
phonenumbers.read
numberpools.read
```

**Critical for Sync:** `voice-ai-dashboard.readonly`

## Troubleshooting Steps

### 1. Verify OAuth Connection

Check if user has an active OAuth token:

```sql
SELECT user_id, location_id, is_active, token_expires_at
FROM api_keys
WHERE user_id = 'USER_ID' AND service = 'highlevel';
```

### 2. Test Token Validity

Use the oauth-test edge function:

```bash
curl -X POST "https://your-project.supabase.co/functions/v1/oauth-test" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -d '{"userId": "USER_ID"}'
```

### 3. Re-establish Connection

1. Go to Admin → Users
2. Select the user
3. Click "Connect HighLevel"
4. Complete OAuth authorization
5. Verify connection appears in UI

### 4. Manual Sync Test

After reconnecting:

1. Click Sync button in header
2. Check browser console for errors
3. Verify calls appear in Call Logs page
4. Check sync_status table for success/failure message

## Common Error Messages

### "No valid OAuth connection found"
- **Cause**: No api_keys record for user
- **Fix**: Reconnect via Admin Users page

### "Failed to refresh token"
- **Cause**: Refresh token invalid or expired
- **Fix**: Re-authorize OAuth connection

### "HighLevel API error: 401 Unauthorized"
- **Cause**: Access token invalid
- **Fix**: Check if token expired, verify scopes

### "No location ID found for user"
- **Cause**: OAuth connection exists but location_id is null
- **Fix**: Disconnect and reconnect to get location_id

## User Visibility Issue (Fixed)

### Problem

After disconnecting a user from HighLevel in the admin panel, the user would disappear from the users list entirely.

### Root Cause

The `AdminUsersPage` component was attempting to load connection status for ALL users, and if any user's status check failed (e.g., due to missing connection), the user would be excluded from the list.

### Solution Applied

1. **Added Individual Error Handling**: Each user's status check now has its own try-catch block
2. **Graceful Degradation**: Users with failed status checks show as "not connected" instead of disappearing
3. **Updated loadUserStatuses()**: Properly handles users without connections
4. **Updated handleDisconnect()**: Refreshes user status list after disconnection

### Verification

Users without HighLevel connections now:
- ✅ Appear in the admin users list
- ✅ Show "Not Connected" status
- ✅ Display without agent or phone badges
- ✅ Can be reconnected via "Connect HighLevel" button

## Database Schema Reference

### api_keys Table (OAuth Tokens)

```sql
CREATE TABLE api_keys (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES users(id),
  service text ('highlevel'),
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  location_id text,
  location_name text,
  company_id text,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz
);
```

### sync_status Table (Per-User Sync Tracking)

```sql
CREATE TABLE sync_status (
  id uuid PRIMARY KEY,
  service text,
  user_id uuid REFERENCES users(id),
  last_sync_at timestamptz,
  last_sync_status text ('success' | 'failure'),
  last_sync_message text,
  records_synced integer,
  created_at timestamptz,
  updated_at timestamptz
);
```

## Edge Functions

### sync-highlevel-calls

**Endpoint**: `POST /functions/v1/sync-highlevel-calls`

**Body**:
```json
{
  "userId": "uuid",
  "startDate": "ISO timestamp (optional)",
  "endDate": "ISO timestamp (optional)"
}
```

**Process**:
1. Fetches OAuth tokens from api_keys table
2. Checks if token expired, refreshes if needed
3. Calls HighLevel API: `/voice-ai/dashboard/call-logs`
4. Processes and saves calls to database
5. Updates sync_status table

### oauth-refresh

**Endpoint**: `POST /functions/v1/oauth-refresh`

**Body**:
```json
{
  "userId": "uuid"
}
```

**Process**:
1. Retrieves refresh_token from api_keys
2. Exchanges refresh_token for new access_token
3. Updates api_keys with new tokens
4. Preserves location_id if not in response

## Best Practices

1. **Never share Client Secret publicly**
   - Currently exposed in frontend (security risk)
   - Should move token exchange to edge function

2. **Always check token expiration**
   - Tokens expire after 24 hours
   - Refresh automatically when within 5 minutes of expiry

3. **Handle disconnection gracefully**
   - Users should remain visible in admin panel
   - Show clear "Not Connected" status
   - Provide easy reconnection flow

4. **Test both scenarios**
   - Connected users with valid tokens
   - Disconnected users without tokens
   - Expired tokens requiring refresh

## Support

For OAuth-related issues:
1. Check browser console for detailed errors
2. Verify environment variables are loaded
3. Check database for api_keys records
4. Test with oauth-test edge function
5. Review HighLevel marketplace app settings

---

**Last Updated**: November 12, 2025
**Version**: v1.5.7
