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
