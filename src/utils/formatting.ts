import { formatInTimeZone } from 'date-fns-tz';

export function toTitleCase(str: string | null): string {
  if (!str) return '';

  return str
    .toLowerCase()
    .split(' ')
    .map(word => {
      if (word.length === 0) return word;
      if (word.length === 1) return word.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

export function formatContactName(name: string | null): string {
  if (!name) return 'Unknown';

  return toTitleCase(name);
}

export function formatPhoneNumber(phoneNumber: string | null): string {
  if (!phoneNumber) return '';

  // Remove all non-digit characters
  const cleaned = phoneNumber.replace(/\D/g, '');

  // Handle different phone number lengths
  if (cleaned.length === 10) {
    // US format: (555) 123-4567
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  } else if (cleaned.length === 11 && cleaned.charAt(0) === '1') {
    // US format with country code: +1 (555) 123-4567
    return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  } else if (cleaned.length > 10) {
    // International format: +XX XXX XXX XXXX
    return `+${cleaned.slice(0, cleaned.length - 10)} ${cleaned.slice(-10, -7)} ${cleaned.slice(-7, -4)} ${cleaned.slice(-4)}`;
  }

  // Return original if format doesn't match expected patterns
  return phoneNumber;
}

export function formatDateEST(date: Date | string | number, formatStr: string = 'MMM d, yyyy h:mm a'): string {
  return formatInTimeZone(date, 'America/New_York', formatStr);
}
