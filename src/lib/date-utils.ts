/**
 * Date parsing and comparison utilities for Dispatch Desk.
 * Normalizes varied spreadsheet date strings (e.g., '23-Sep-2026', '12 Sep 2026', '2026-09-15', '4-Sep-2026')
 * into ISO 'YYYY-MM-DD' format and performs today, tomorrow, and date-range comparisons.
 */

const MONTH_MAP: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  january: 1, february: 2, march: 3, april: 4, may_: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

/**
 * Normalizes any spreadsheet date string into a standard 'YYYY-MM-DD' format.
 * Returns null if the string is empty or cannot be parsed.
 */
export function parseSheetDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // 1. Try D-MMM-YYYY or DD-MMM-YYYY (e.g. 23-Sep-2026, 4-Sep-2026)
  // or D MMM YYYY / DD MMM YYYY (e.g. 12 Sep 2026)
  const dMmmY = trimmed.match(/^(\d{1,2})[-\s/]([A-Za-z]{3,})[-\s/](\d{4})/);
  if (dMmmY) {
    const day = parseInt(dMmmY[1], 10);
    const monthKey = dMmmY[2].toLowerCase().slice(0, 3);
    const year = parseInt(dMmmY[3], 10);
    const month = MONTH_MAP[monthKey];
    if (month && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  // 2. Try YYYY-MM-DD
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  // 3. Try DD/MM/YYYY or DD-MM-YYYY
  const ddmmyyyy = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (ddmmyyyy) {
    const day = parseInt(ddmmyyyy[1], 10);
    const month = parseInt(ddmmyyyy[2], 10);
    const year = parseInt(ddmmyyyy[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  // 4. Try JS Date parse
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, "0");
    const d = String(parsed.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  return null;
}

/**
 * Returns today's date in local calendar time formatted as 'YYYY-MM-DD'.
 */
export function getLocalTodayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Returns tomorrow's date in local calendar time formatted as 'YYYY-MM-DD'.
 */
export function getLocalTomorrowISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Checks if the given sheet date string matches today.
 */
export function isDateToday(raw: string | null | undefined): boolean {
  const iso = parseSheetDate(raw);
  if (!iso) return false;
  return iso === getLocalTodayISO();
}

/**
 * Checks if the given sheet date string matches tomorrow.
 */
export function isDateTomorrow(raw: string | null | undefined): boolean {
  const iso = parseSheetDate(raw);
  if (!iso) return false;
  return iso === getLocalTomorrowISO();
}

/**
 * Checks if a given sheet date string falls between [fromISO, toISO] (inclusive).
 */
export function isWithinDateRange(
  raw: string | null | undefined,
  fromISO?: string | null,
  toISO?: string | null,
): boolean {
  if (!fromISO && !toISO) return true;
  const iso = parseSheetDate(raw);
  if (!iso) return false;

  if (fromISO && iso < fromISO) return false;
  if (toISO && iso > toISO) return false;
  return true;
}

/**
 * Formats a sheet date string into a friendly, human-readable display string
 * and flags if it represents Today or Tomorrow.
 */
export function formatFriendlyDate(raw: string | null | undefined): {
  text: string;
  isToday: boolean;
  isTomorrow: boolean;
} {
  if (!raw) return { text: "—", isToday: false, isTomorrow: false };
  const iso = parseSheetDate(raw);
  if (!iso) return { text: raw, isToday: false, isTomorrow: false };

  const today = getLocalTodayISO();
  const tomorrow = getLocalTomorrowISO();
  const parts = iso.split("-");
  const monthNames = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const mIndex = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  const formatted = `${day} ${monthNames[mIndex] || parts[1]}`;

  if (iso === today) {
    return { text: `Today (${formatted})`, isToday: true, isTomorrow: false };
  }
  if (iso === tomorrow) {
    return { text: `Tomorrow (${formatted})`, isToday: false, isTomorrow: true };
  }
  return { text: formatted, isToday: false, isTomorrow: false };
}


