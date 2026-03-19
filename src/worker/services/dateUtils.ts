/**
 * Date Utilities
 * 
 * Simple date helper functions.
 * The sandbox date (2026-02-20) is the actual current date.
 */

/**
 * Get the current date
 */
export function getRealDate(): Date {
  return new Date();
}

/**
 * Get today's date string in YYYY-MM-DD format
 */
export function getRealDateString(): string {
  return formatDateLocalYMD(getRealDate());
}

/**
 * Get a date relative to the current date
 * @param daysOffset - Number of days to add (negative for past)
 */
export function getRealDateOffset(daysOffset: number): Date {
  const realDate = getRealDate();
  realDate.setDate(realDate.getDate() + daysOffset);
  return realDate;
}

/**
 * Format a date for provider game API (YYYY-MMM-DD format)
 */
export function formatSDIODateCorrected(date: Date): string {
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  return `${date.getUTCFullYear()}-${months[date.getUTCMonth()]}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Format a date as YYYY-MM-DD using local calendar components.
 */
export function formatDateLocalYMD(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Format a date as YYYY-MM-DD in a target IANA timezone.
 */
export function formatDateInTimeZoneYMD(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = Number(parts.find((p) => p.type === "year")?.value || "0");
  const month = Number(parts.find((p) => p.type === "month")?.value || "0");
  const day = Number(parts.find((p) => p.type === "day")?.value || "0");
  return `${year.toString().padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Current date in America/New_York (YYYY-MM-DD).
 */
export function getTodayEasternDateString(): string {
  return formatDateInTimeZoneYMD(new Date(), "America/New_York");
}

/**
 * Date in America/New_York offset by whole days from now.
 */
export function getEasternDateStringOffset(daysOffset: number): string {
  const now = new Date();
  const shifted = new Date(now.getTime() + daysOffset * 24 * 60 * 60 * 1000);
  return formatDateInTimeZoneYMD(shifted, "America/New_York");
}

/**
 * Log date debugging info
 */
export function logDateDebug(): void {
  const now = new Date();
  console.log('[Date Utils] Current date:', now.toISOString());
}
