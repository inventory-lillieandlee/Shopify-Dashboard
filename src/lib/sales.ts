// Pure sales helpers (no I/O) — shared by the seam reader, the chart, and tests.

export interface MonthlySale {
  /** "YYYY-MM" (UTC calendar month) */
  month: string;
  units: number;
}

/** The last `n` months (data is stored ascending). Returns all when fewer than n. */
export function lastNMonths(sales: MonthlySale[], n: number): MonthlySale[] {
  if (n <= 0) return [];
  return sales.slice(-n);
}

/**
 * Earliest month present across all SKUs ("YYYY-MM"), or null when there's no history.
 * This is the point before which the dataset simply has no data — leading chart zeros
 * are "not tracked yet", not literal zero sales. "YYYY-MM" is zero-padded so lexical
 * string comparison is chronological; no Date parsing needed.
 */
export function historyStartMonth(byProduct: Record<string, MonthlySale[]>): string | null {
  let min: string | null = null;
  for (const arr of Object.values(byProduct)) {
    for (const s of arr) if (min === null || s.month < min) min = s.month;
  }
  return min;
}

/** "YYYY-MM" → full month + year, e.g. "February 2026". */
export function longMonthYear(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, 1)).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "YYYY-MM" → short month name, e.g. "Apr". */
export function shortMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, 1)).toLocaleString("en-US", {
    month: "short",
    timeZone: "UTC",
  });
}

/** Short chart label for a "YYYY-MM", with "(MTD)" on the current (partial) month. */
export function monthLabel(month: string, currentMonth: string): string {
  return month === currentMonth ? `${shortMonth(month)} (MTD)` : shortMonth(month);
}
