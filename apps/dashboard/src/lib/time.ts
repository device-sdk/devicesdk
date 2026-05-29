/**
 * Time helpers shared across dashboard pages.
 *
 * The API returns epoch timestamps that may be expressed in seconds or
 * milliseconds; `normalizeTimestamp` coerces them to milliseconds so the rest
 * of the UI can assume one unit.
 */

/** Year 2000 expressed in epoch milliseconds. */
const YEAR_2000_MS = 946684800000;

/**
 * Coerce an epoch timestamp to milliseconds. Values below year-2000-in-ms are
 * assumed to be in seconds (the API mixes both representations).
 */
export function normalizeTimestamp(timestamp: number): number {
  return timestamp < YEAR_2000_MS ? timestamp * 1000 : timestamp;
}

/**
 * Format an epoch timestamp as a localized `en-US` date. Pass
 * `{ withTime: true }` to append the hour and minute.
 */
export function formatDate(
  timestamp: number,
  options: { withTime?: boolean } = {},
): string {
  const formatOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  };
  if (options.withTime) {
    formatOptions.hour = '2-digit';
    formatOptions.minute = '2-digit';
  }
  return new Date(normalizeTimestamp(timestamp)).toLocaleDateString(
    'en-US',
    formatOptions,
  );
}
