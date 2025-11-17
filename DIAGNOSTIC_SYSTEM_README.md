# Call Sync Diagnostic System

## Overview

This diagnostic system provides comprehensive logging and analysis tools to identify and troubleshoot missing calls between HighLevel Voice AI and your database. It includes real-time sync logging, historical tracking, and detailed comparison reports.

## Components Implemented

### 1. Database Migration: `call_sync_logs` Table
**File:** `supabase/migrations/20251117030000_add_call_sync_logging_system.sql`

Creates a comprehensive logging table that tracks every sync operation:

**Key Fields:**
- `sync_type`: 'manual', 'auto', or 'diagnostic'
- `sync_status`: 'success', 'partial', 'failed', or 'in_progress'
- `api_params`: Parameters sent to HighLevel API (date ranges, location, etc.)
- `api_response_summary`: Metadata from API (total fetched, page count, date range covered)
- `processing_summary`: Statistics (saved, skipped, errors, skip reasons)
- `skipped_calls`: Detailed array of skipped calls with reasons
- `error_details`: Any errors encountered
- `duration_ms`: Sync operation duration

**Features:**
- RLS policies for secure access (admins see all, users see own)
- Automatic cleanup function for logs older than 90 days
- Indexed for efficient queries

### 2. Enhanced Sync Function
**File:** `supabase/functions/sync-highlevel-calls/index.ts`

**New Features Added:**

#### A. Pagination Support
- Automatically fetches ALL calls across multiple pages
- Configurable page size (default: 100 calls per page)
- Safety limit of 50 pages max to prevent infinite loops
- Rate limiting with 100ms delay between requests
- Logs each page fetch with duration and call count

#### B. Comprehensive Logging
Every sync operation now logs:
- Initial parameters and configuration
- Each API page fetch with timing
- Agent assignment filtering decisions
- Individual call processing results
- Skip reasons for each filtered call
- Final summary with aggregated statistics

**Log Levels:**
- `[INIT]` - Initialization and setup
- `[DATE]` - Date range determination
- `[API]` - HighLevel API requests
- `[FILTER]` - Agent filtering decisions
- `[PROCESS]` - Call processing
- `[SAVE]` - Successful database saves
- `[SKIP]` - Skipped calls with reasons
- `[ERROR]` - Errors encountered
- `[COMPLETE]` - Final summary
- `[LOG]` - Database log updates

#### C. Skip Reason Tracking
Categorizes why calls are skipped:
- `no_agent_id_in_call` - Call data missing agent ID
- `agent_not_in_system` - Agent doesn't exist in database
- `agent_not_assigned_to_user` - Agent exists but not assigned to user
- Other errors tracked individually

#### D. Enhanced Response
Returns comprehensive sync results:
```json
{
  "success": true,
  "savedCount": 142,
  "skippedCount": 103,
  "errorCount": 0,
  "totalFetched": 245,
  "pagesFetched": 3,
  "syncLogId": "uuid",
  "duration_ms": 5234,
  "skipReasons": {
    "agent_not_assigned_to_user": 95,
    "agent_not_in_system": 5,
    "no_agent_id_in_call": 3
  },
  "logs": ["[INIT] ...", "[API] ...", ...]
}
```

### 3. Diagnostic Comparison Tool
**File:** `supabase/functions/diagnostic-call-comparison/index.ts`

A dedicated edge function that compares HighLevel data directly with your database:

**What it does:**
1. Fetches ALL calls from HighLevel API (with pagination) for specified date range
2. Fetches ALL calls from database for same date range
3. Compares both datasets by `highlevel_call_id`
4. Identifies discrepancies and categorizes reasons

**Returns:**
```json
{
  "summary": {
    "dateRange": {"start": "...", "end": "..."},
    "highlevelTotal": 245,
    "databaseTotal": 142,
    "matching": 140,
    "missingInDatabase": 103,
    "extraInDatabase": 2
  },
  "missingCalls": [
    {
      "callId": "abc123",
      "status": "only_highlevel",
      "agentId": "agent-eng",
      "agentStatus": "not_assigned",
      "reason": "agent_not_assigned_to_user",
      "fromNumber": "+1234567890",
      "callDate": "2025-01-15T10:30:00Z"
    }
  ],
  "reasonBreakdown": {
    "agent_not_assigned_to_user": 95,
    "agent_not_in_system": 5
  },
  "agentAnalysis": {
    "totalAgentsInCalls": 3,
    "assignedToUser": 2,
    "unassignedAgents": [
      {
        "highlevelId": "agent-eng",
        "name": "Agent - ENG",
        "inSystem": true,
        "callCount": 95
      }
    ]
  }
}
```

**Key Features:**
- Non-destructive (read-only analysis)
- Respects `calls_reset_at` for date filtering
- Identifies unassigned agents causing missing calls
- Automatically logs as 'diagnostic' type sync

### 4. Admin Diagnostic UI
**File:** `src/components/admin/DiagnosticPanel.tsx`

A comprehensive React component for the admin interface:

**Features:**

#### A. Run Diagnostic Button
- Triggers the diagnostic comparison tool
- Shows real-time loading state
- Displays results in organized panels

#### B. Summary Dashboard
Visual cards showing:
- HighLevel Total (calls in HL API)
- Database Total (calls in DB)
- Matching (calls in both)
- Missing in DB (calls only in HL)
- Date range analyzed

#### C. Missing Calls Breakdown
- Shows count by reason (unassigned agents, missing agents, etc.)
- Export to CSV functionality
- Detailed view of each missing call

#### D. Unassigned Agents Alert
- Highlights agents found in calls but not assigned to user
- Shows call count per agent
- Indicates if agent exists in system or not
- Suggests action: assign agent to user

#### E. Recent Sync Operations
- Lists last 10 sync operations
- Status indicators (success, partial, failed)
- Expandable details showing:
  - API response summary
  - Skip reasons
  - Sample skipped calls
- Export individual logs as JSON

#### F. Export Options
- Export diagnostic report as JSON
- Export missing calls as CSV
- Export individual sync logs as JSON

**Integration:**
Added as new "Diagnostics" tab in User Details page (`UserDetailsPage.tsx`)

## Usage Guide

### For Admins

#### 1. Run a Diagnostic Report

1. Navigate to Admin > Users
2. Click on a user to view details
3. Click the "Diagnostics" tab
4. Click "Run Diagnostic Report"
5. Wait for analysis (typically 5-15 seconds)
6. Review the results:
   - Check the summary for discrepancies
   - Look at "Missing Calls Breakdown" to see why calls weren't saved
   - Check "Unassigned Agents" section for agents that need to be assigned

#### 2. Review Sync History

In the Diagnostics tab:
- View recent sync operations
- Click on any sync to expand details
- Export logs for deeper analysis

#### 3. Troubleshoot Missing Calls

Common scenarios identified by diagnostic:

**Scenario A: "agent_not_assigned_to_user" (95 calls)**
- **Issue:** Calls exist in HighLevel for agents not assigned to this user
- **Solution:**
  - Go to API tab
  - Click "Fetch Available Agents"
  - Assign the missing agent to the user
  - Run sync again

**Scenario B: "agent_not_in_system" (5 calls)**
- **Issue:** HighLevel has calls from an agent that doesn't exist in your database
- **Solution:**
  - Go to API tab
  - Click "Fetch Available Agents" to add the agent to system
  - Then assign it to the user
  - Run sync again

**Scenario C: "no_agent_id_in_call" (3 calls)**
- **Issue:** HighLevel call data is missing agent ID
- **Note:** These are typically test calls or incomplete data - may be expected

### For Developers

#### Analyzing Sync Logs Programmatically

Query sync logs:
```sql
SELECT
  sync_started_at,
  sync_type,
  sync_status,
  processing_summary->'saved' as calls_saved,
  processing_summary->'skipped' as calls_skipped,
  processing_summary->'skipReasons' as skip_reasons,
  duration_ms
FROM call_sync_logs
WHERE user_id = 'xxx'
ORDER BY sync_started_at DESC
LIMIT 10;
```

#### Calling Diagnostic API Directly

```javascript
const response = await fetch(
  `${SUPABASE_URL}/functions/v1/diagnostic-call-comparison`,
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      userId: 'user-id',
      startDate: '2025-01-01T00:00:00Z', // optional
      endDate: '2025-01-31T23:59:59Z',   // optional
      includeRawData: false,              // optional, default false
    }),
  }
);

const result = await response.json();
```

## Important Notes

### Date Ranges and `calls_reset_at`

The system respects the `calls_reset_at` field in billing_accounts:

- **Sync Function:** Only fetches calls AFTER `calls_reset_at` to avoid re-downloading history
- **Database:** Preserves ALL historical calls including those before reset
- **Diagnostic Tool:** Compares calls AFTER `calls_reset_at` to match what sync would fetch
- **User View:** Shows ALL calls regardless of reset date

This design:
- Minimizes API usage
- Preserves historical data across billing periods
- Enables accurate diagnostic comparisons

### Pagination Limits

- Default page size: 100 calls per request
- Maximum pages: 50 (safety limit = 5000 calls max per sync)
- Rate limiting: 100ms delay between pages
- If you have more than 5000 calls in a period, adjust `maxPages` constant

### Performance Considerations

- Diagnostic scans can take 10-30 seconds for large datasets
- Sync logs are automatically cleaned up after 90 days
- Database queries are indexed for efficient retrieval

## Monitoring & Maintenance

### Regular Tasks

1. **Weekly:** Review sync success rates in admin dashboard
2. **Monthly:** Check for recurring skip patterns
3. **As Needed:** Run diagnostic when users report missing calls
4. **Quarterly:** Run cleanup function manually if needed:
   ```sql
   SELECT cleanup_old_sync_logs();
   ```

### Key Metrics to Monitor

- Sync success rate (should be >95%)
- Skip count trends (sudden spikes indicate issues)
- Most common skip reasons
- Average sync duration
- Agent assignment coverage

## Troubleshooting

### "No calls fetched from HighLevel"

1. Check OAuth token is valid
2. Verify `location_id` is set correctly
3. Confirm date range has calls in HighLevel dashboard
4. Check API rate limits haven't been exceeded

### "All calls being skipped"

1. Verify user has agents assigned in API tab
2. Check agent HighLevel IDs match between systems
3. Run diagnostic to see exact skip reasons

### "Diagnostic taking too long"

1. Check date range - narrow it down if analyzing >6 months
2. Verify HighLevel API is responding normally
3. Check database performance

## Future Enhancements

Potential improvements to consider:

1. **Scheduled Diagnostics:** Auto-run weekly and email admins
2. **Alert Thresholds:** Notify when skip rate exceeds threshold
3. **Agent Auto-Assignment:** Automatically assign agents found in calls
4. **Sync Retry Queue:** Auto-retry failed syncs
5. **Dashboard Widgets:** Add diagnostic summaries to main admin dashboard
6. **API Rate Limit Detection:** Smarter handling of 429 responses

## Files Modified/Created

### Created:
- `supabase/migrations/20251117030000_add_call_sync_logging_system.sql`
- `supabase/functions/diagnostic-call-comparison/index.ts`
- `src/components/admin/DiagnosticPanel.tsx`
- `DIAGNOSTIC_SYSTEM_README.md`

### Modified:
- `supabase/functions/sync-highlevel-calls/index.ts` - Added pagination and logging
- `src/pages/UserDetailsPage.tsx` - Added Diagnostics tab

## Testing Checklist

- [ ] Apply database migration
- [ ] Deploy edge functions
- [ ] Run a manual sync and verify log is created
- [ ] Check sync log in database has all fields populated
- [ ] Run diagnostic tool via UI
- [ ] Verify diagnostic report shows accurate data
- [ ] Export diagnostic as JSON
- [ ] Export missing calls as CSV
- [ ] Review recent sync logs in UI
- [ ] Test with user who has missing calls
- [ ] Verify unassigned agents are identified correctly
