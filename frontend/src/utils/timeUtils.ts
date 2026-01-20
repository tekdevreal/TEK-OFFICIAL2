/**
 * Time utility functions for CET timezone conversion and formatting
 */

/**
 * Convert a UTC date to CET (Central European Time) timezone
 * CET is UTC+1, CEST (Central European Summer Time) is UTC+2
 * JavaScript automatically handles daylight saving time when using 'Europe/Paris' timezone
 */
export function toCET(date: Date | string | number): Date {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  // Create a new date in CET timezone
  return new Date(d.toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
}

/**
 * Format a date to CET timezone in 24-hour format (HH:MM)
 * Example: "13:00", "14:30", "23:59"
 */
export function formatCETTime(date: Date | string | number): string {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  return d.toLocaleString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Europe/Paris',
  });
}

/**
 * Format a date to CET timezone with date and time
 * Example: "2025-01-19 13:00 CET"
 */
export function formatCETDateTime(date: Date | string | number): string {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  const dateStr = d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Europe/Paris',
  });
  const timeStr = formatCETTime(d);
  return `${dateStr} ${timeStr} CET`;
}

/**
 * Get current epoch date in CET timezone
 * Epoch starts at 00:00 CET
 */
export function getCurrentEpochCET(): string {
  const now = new Date();
  // Get the date in CET timezone
  const cetDate = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
  const year = cetDate.getFullYear();
  const month = String(cetDate.getMonth() + 1).padStart(2, '0');
  const day = String(cetDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get epoch date from a timestamp in CET timezone
 */
export function getEpochFromTimestampCET(timestamp: Date | string | number): string {
  const d = typeof timestamp === 'string' || typeof timestamp === 'number' ? new Date(timestamp) : timestamp;
  const cetDate = new Date(d.toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
  const year = cetDate.getFullYear();
  const month = String(cetDate.getMonth() + 1).padStart(2, '0');
  const day = String(cetDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Check if a timestamp is in the current CET epoch
 */
export function isInCurrentEpochCET(timestamp: Date | string | number): boolean {
  const currentEpoch = getCurrentEpochCET();
  const timestampEpoch = getEpochFromTimestampCET(timestamp);
  return currentEpoch === timestampEpoch;
}
