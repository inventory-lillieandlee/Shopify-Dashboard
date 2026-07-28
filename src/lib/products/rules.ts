// Pure decision logic for the product picker + backfill worker. Extracted so the
// behaviours are unit-testable without an HTTP/DB/Shopify harness. The routes/worker call
// these; the month-window + cursor helpers live in shopify/backfill.ts (also unit-tested).

/** The four categories the dashboard tracks (thresholds + lead-time defaults exist for these). */
export const TRACKABLE_CATEGORIES = ["supplement_chews", "cbd", "treats", "salmon_oil"] as const;
export type TrackableCategory = (typeof TRACKABLE_CATEGORIES)[number];

/** Add requires an explicit, valid category pick (never inferred from the title). */
export function isTrackableCategory(c: string): c is TrackableCategory {
  return (TRACKABLE_CATEGORIES as readonly string[]).includes(c);
}

/** The dashboard tracks single-variant SKUs; multi-variant products are rejected. */
export function isMultiVariant(variantCount: number): boolean {
  return variantCount > 1;
}

/** auto_activate defaults TRUE (real add → appears when ready); an explicit false (the
 *  verification run) is the only way to opt out. Anything non-boolean-true is treated as
 *  the caller's intent only when explicitly present. */
export function resolveAutoActivate(v: unknown): boolean {
  return v === undefined ? true : v === true;
}

/** Backfill failure classification: a permanent error, or too many consecutive transient
 *  failures on the current chunk (attempts already incremented). Otherwise it retries. */
export function backfillShouldFail(permanent: boolean, attempts: number): boolean {
  return permanent || attempts > 3;
}
