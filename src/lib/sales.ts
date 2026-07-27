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
 * Earliest month with ANY sales across all SKUs ("YYYY-MM"), or null when there are no
 * sales yet. This is the true data floor: the backfill writes zero rows for months
 * before the store ramped (Feb/Mar are all-zero), and flooring at those makes the chart
 * open on flat empty bars that read as broken. We floor at the first month that actually
 * has units. "YYYY-MM" is zero-padded, so lexical string comparison is chronological.
 */
export function historyStartMonth(byProduct: Record<string, MonthlySale[]>): string | null {
  let min: string | null = null;
  for (const arr of Object.values(byProduct)) {
    for (const s of arr) if (s.units > 0 && (min === null || s.month < min)) min = s.month;
  }
  return min;
}

/**
 * Drop leading all-zero months from a SKU's series so its chart opens on the first month
 * it actually sold, not on empty bars from before it launched. Interior/trailing zeros
 * (a real month with no sales) are kept. All-zero series is returned unchanged (the
 * popup's empty-state copy covers "no sales yet").
 */
export function trimLeadingZeroMonths(sales: MonthlySale[]): MonthlySale[] {
  const first = sales.findIndex((s) => s.units > 0);
  return first > 0 ? sales.slice(first) : sales;
}

/**
 * Whether the current-month sales row is stale — older than `thresholdMs` (default 6h),
 * so the chart's live month may trail Shopify. `null` updatedAt → not stale (there's
 * nothing to compare; the chart's empty-state covers "no data"). Pure: `nowMs` is passed
 * in so it's deterministic and testable.
 */
export function isSalesStale(updatedAt: string | null, nowMs: number, thresholdMs = 6 * 60 * 60 * 1000): boolean {
  if (!updatedAt) return false;
  return nowMs - new Date(updatedAt).getTime() > thresholdMs;
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
