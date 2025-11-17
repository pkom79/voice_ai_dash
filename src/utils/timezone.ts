import { formatInTimeZone, toZonedTime, fromZonedTime } from 'date-fns-tz';
import { format } from 'date-fns';
import { supabase } from '../lib/supabase';

/**
 * Get the HighLevel location timezone for a user from the database
 * @param userId - User ID to fetch timezone for
 * @returns IANA timezone string (e.g., 'America/New_York') or null if not found
 */
export async function getLocationTimezone(userId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('api_keys')
      .select('location_timezone')
      .eq('user_id', userId)
      .eq('service', 'highlevel')
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      console.error('Error fetching location timezone:', error);
      return null;
    }

    return data?.location_timezone || null;
  } catch (error) {
    console.error('Error in getLocationTimezone:', error);
    return null;
  }
}

/**
 * Create a date representing the start of the day (00:00:00) in the specified timezone
 * @param date - Date to convert
 * @param timezone - IANA timezone string (e.g., 'America/New_York')
 * @returns ISO 8601 string with timezone offset (e.g., '2025-11-04T00:00:00-05:00')
 */
export function createDayStart(date: Date, timezone: string): string {
  // Create a new date with time set to start of day in the target timezone
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  
  // Create date in local time, then interpret it as being in the target timezone
  const localDate = new Date(year, month, day, 0, 0, 0, 0);
  const zonedDate = fromZonedTime(localDate, timezone);
  
  // Format as ISO 8601 with timezone offset
  return formatInTimeZone(zonedDate, timezone, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

/**
 * Create a date representing the end of the day (23:59:59) in the specified timezone
 * @param date - Date to convert
 * @param timezone - IANA timezone string (e.g., 'America/New_York')
 * @returns ISO 8601 string with timezone offset (e.g., '2025-11-04T23:59:59-05:00')
 */
export function createDayEnd(date: Date, timezone: string): string {
  // Create a new date with time set to end of day in the target timezone
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  
  // Create date in local time, then interpret it as being in the target timezone
  const localDate = new Date(year, month, day, 23, 59, 59, 999);
  const zonedDate = fromZonedTime(localDate, timezone);
  
  // Format as ISO 8601 with timezone offset
  return formatInTimeZone(zonedDate, timezone, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

/**
 * Format a date with timezone information
 * @param date - Date to format
 * @param timezone - IANA timezone string
 * @returns Formatted date string with timezone offset
 */
export function formatWithTimezone(date: Date, timezone: string): string {
  return formatInTimeZone(date, timezone, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

/**
 * Get a friendly timezone display name
 * @param timezone - IANA timezone string (e.g., 'America/New_York')
 * @param date - Optional date to determine if DST is active (defaults to now)
 * @returns Timezone abbreviation (e.g., 'EST' or 'EDT') or the full timezone name if abbreviation unavailable
 */
export function getTimezoneDisplay(timezone: string, date: Date = new Date()): string {
  try {
    // Get the timezone abbreviation (e.g., 'EST', 'EDT', 'PST', 'PDT')
    const abbreviation = formatInTimeZone(date, timezone, 'zzz');
    
    // If we got a valid abbreviation (not the full timezone name), return it
    if (abbreviation && abbreviation !== timezone && abbreviation.length <= 5) {
      return abbreviation;
    }
    
    // Fallback: return a cleaned up version of the timezone name
    return timezone.split('/').pop() || timezone;
  } catch (error) {
    console.error('Error getting timezone display:', error);
    return timezone;
  }
}

/**
 * Get full timezone display with abbreviation
 * @param timezone - IANA timezone string (e.g., 'America/New_York')
 * @param date - Optional date to determine if DST is active (defaults to now)
 * @returns Formatted string like "America/New_York (EST)" or "America/Los_Angeles (PDT)"
 */
export function getFullTimezoneDisplay(timezone: string, date: Date = new Date()): string {
  const abbreviation = getTimezoneDisplay(timezone, date);
  return `${timezone} (${abbreviation})`;
}

/**
 * Validate if a string is a valid IANA timezone
 * @param timezone - Timezone string to validate
 * @returns True if valid, false otherwise
 */
export function isValidTimezone(timezone: string): boolean {
  try {
    formatInTimeZone(new Date(), timezone, 'yyyy-MM-dd');
    return true;
  } catch {
    return false;
  }
}

/**
 * Convert a date to the specified timezone for display purposes
 * @param date - Date to convert
 * @param timezone - IANA timezone string
 * @returns Date object representing the same moment in the target timezone
 */
export function toTimezone(date: Date, timezone: string): Date {
  return toZonedTime(date, timezone);
}

/**
 * Calculate the difference in days between two dates
 * @param start - Start date
 * @param end - End date
 * @returns Number of days between the dates
 */
export function getDaysDifference(start: Date, end: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const startTime = start.getTime();
  const endTime = end.getTime();
  return Math.ceil((endTime - startTime) / msPerDay);
}
