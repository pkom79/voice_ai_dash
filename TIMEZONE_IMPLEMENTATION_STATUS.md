# Timezone-Aware Admin Sync Implementation Status

## Completed

### 1. Database Migration ✓
- **File**: `supabase/migrations/20251117200000_add_timezone_support.sql`
- Added `location_timezone` column to `api_keys` table
- Added timezone tracking columns to `call_sync_logs` table:
  - `timezone_used`
  - `admin_override`
  - `admin_user_id`
  - `original_reset_date`
- Created indexes for efficient queries

### 2. Timezone Utility Functions ✓
- **File**: `src/utils/timezone.ts`
- Created comprehensive timezone handling functions:
  - `getLocationTimezone(userId)` - Fetch user's HL location timezone
  - `createDayStart(date, timezone)` - Convert to 00:00:00 in timezone
  - `createDayEnd(date, timezone)` - Convert to 23:59:59 in timezone
  - `formatWithTimezone(date, timezone)` - Format with timezone offset
  - `getTimezoneDisplay(timezone)` - Get abbreviation (EST/EDT/etc)
  - `getFullTimezoneDisplay(timezone)` - Full display with abbreviation
  - `isValidTimezone(timezone)` - Validation function
  - `getDaysDifference(start, end)` - Calculate day difference

### 3. OAuth Service Enhancement ✓
- **File**: `src/services/oauth.ts`
- Updated `fetchAndStoreLocationName()` function to:
  - Fetch timezone from HighLevel location API
  - Store timezone in `api_keys.location_timezone`
  - Log extracted timezone information
  - Default to 'America/New_York' if not provided by API

### 4. DateRangePicker Component ✓
- **File**: `src/components/DateRangePicker.tsx`
- Added timezone support props:
  - `timezone?: string | null`
  - `showTimezoneInfo?: boolean`
- Display timezone information banner:
  - Shows "All times in America/New_York (EST)" format
  - Uses MapPin icon for visual clarity
  - Blue-themed banner matching brand colors
- Quick select presets respect timezone
- Returns dates interpreted in location timezone

### 5. Dependencies ✓
- Installed `date-fns-tz@^3.2.0` for timezone handling

## Remaining Work

### 1. Update Sync Edge Function
- **File**: `supabase/functions/sync-highlevel-calls/index.ts`
- [ ] Add new request parameters:
  - `timezone`: IANA timezone string
  - `admin_override`: boolean flag
  - `admin_user_id`: ID of admin performing sync
- [ ] Modify date handling logic:
  - Use provided dates when `admin_override` is true
  - Pass timezone parameter to HighLevel API
  - Format dates with timezone offset
- [ ] Update sync log creation:
  - Store timezone_used
  - Store admin_override flag
  - Store admin_user_id
  - Store original_reset_date if bypassed
- [ ] Add HighLevel API timezone parameter:
  - Add `&timezone=America/New_York` to API URL
  - Ensure date range is interpreted correctly

### 2. Update UserDetailsPage
- **File**: `src/pages/UserDetailsPage.tsx`
- [ ] Add state for location timezone
- [ ] Fetch timezone when loading API data
- [ ] Update "Resync Calls" modal:
  - Replace text input with DateRangePicker component
  - Pass location timezone to DateRangePicker
  - Add "Admin Override" checkbox
  - Add validation for date range
  - Show warning when override enabled
  - Display timezone info
  - Default dates: Nov 1, 2025 to Today
- [ ] Modify `handleResyncCalls` function:
  - Convert selected dates using timezone utils
  - Format as ISO 8601 with offset
  - Pass all new parameters to edge function

### 3. Update Admin Service (if needed)
- **File**: `src/services/admin.ts`
- [ ] Add helper function for admin historical sync
- [ ] Add validation for date ranges
- [ ] Add estimated call count function (optional)

### 4. Update README.md
- [ ] Document timezone handling behavior
- [ ] Add admin sync override documentation
- [ ] Update API connection information
- [ ] Add troubleshooting for timezone issues

## Testing Required

1. **Database Migration**
   - [ ] Apply migration to development database
   - [ ] Verify columns created successfully
   - [ ] Check default values applied to existing records

2. **Timezone Fetching**
   - [ ] Connect new user via OAuth
   - [ ] Verify timezone is fetched and stored
   - [ ] Test with different location timezones

3. **DateRangePicker**
   - [ ] Test timezone display
   - [ ] Verify quick select presets work
   - [ ] Test date selection across months
   - [ ] Verify display with different timezones

4. **Admin Sync**
   - [ ] Test sync with Nov 1 - Nov 30 date range
   - [ ] Verify calls_reset_at is bypassed when override enabled
   - [ ] Check timezone parameter sent to HighLevel API
   - [ ] Verify full day coverage (00:00:00 to 23:59:59)
   - [ ] Test with different location timezones

5. **Sync Logs**
   - [ ] Verify timezone_used is recorded
   - [ ] Check admin_override flag is set correctly
   - [ ] Verify admin_user_id is captured
   - [ ] Test diagnostic panel shows timezone info

## Key Design Decisions

1. **Default Timezone**: America/New_York
   - Used as fallback when HighLevel doesn't provide timezone
   - Applied to existing records during migration

2. **Timezone Source**: Single Source of Truth
   - Timezone always fetched from HighLevel location API
   - Stored in database for offline access
   - Updated on OAuth connection and token refresh

3. **Date Range Handling**: Server-Side Conversion
   - Frontend passes dates and timezone identifier
   - Backend handles all timezone conversions
   - HighLevel API receives properly formatted dates with offset

4. **Admin Override**: Explicit Action
   - Requires checkbox confirmation
   - Shows warning message
   - Creates audit trail in sync logs
   - Does not modify calls_reset_at value (preserves it for regular syncs)

5. **Brand Consistency**: Blue Theme
   - Timezone info banner uses bg-blue-50
   - MapPin icon in blue-600
   - Maintains existing button and badge styles

## Known Limitations

1. **Timezone Changes**: If a location's timezone changes in HighLevel, it will only update on next OAuth connection or token refresh
2. **DST Transitions**: Handled automatically by date-fns-tz library
3. **Historical Data**: Existing calls in database do not have timezone information retroactively applied

## Next Steps

1. Complete UserDetailsPage sync modal updates
2. Update sync edge function with timezone support
3. Test end-to-end flow with real HighLevel data
4. Document timezone behavior in README
5. Deploy and verify in production
