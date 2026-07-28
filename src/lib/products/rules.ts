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

// ── product-picker catalog filtering (pure; the seam reader in data/catalog.ts wraps it) ──
export interface CatalogRow {
  variant_id: number;
  shopify_product_id: number;
  title: string;
  sku: string | null;
  variant_title: string | null;
  status: string;
  variant_count: number;
}
export interface CatalogOption extends CatalogRow {
  selectable: boolean;
  reason: string | null; // why disabled (multi-variant), else null
  previouslyRemoved: boolean; // tracked before, now inactive → re-add reactivates on variant_id
}

/**
 * Catalog entries the picker can offer. Only ACTIVE (already-tracked) variants are excluded;
 * INACTIVE (previously removed) variants ARE offered, flagged `previouslyRemoved` so the UI
 * can label them — selecting one hits the add route's reactivate-on-variant_id path (never a
 * duplicate insert). Multi-variant products are DISABLED with a reason. Sorted by title.
 */
export function availableFromCatalog(
  rows: CatalogRow[],
  activeVariantIds: Set<number>,
  inactiveVariantIds: Set<number>,
): CatalogOption[] {
  return rows
    .filter((r) => !activeVariantIds.has(Number(r.variant_id))) // active = already tracked → hide
    .map((r) => {
      const multi = isMultiVariant(r.variant_count ?? 1);
      return {
        ...r,
        selectable: !multi,
        reason: multi ? `${r.variant_count} variants — single-variant SKUs only` : null,
        previouslyRemoved: inactiveVariantIds.has(Number(r.variant_id)),
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title));
}

/**
 * On re-add, is the retained monthly_sales still current enough to REUSE (skip the full
 * month sweep)? True when the newest stored month is the current or previous month; a
 * product removed longer ago has stale months and must re-enqueue a full backfill.
 * "YYYY-MM" compares lexically, so >= previousMonthKey means current-or-previous.
 */
export function monthlySalesIsCurrent(newestMonth: string | null, previousMonthKey: string): boolean {
  return newestMonth != null && newestMonth >= previousMonthKey;
}
