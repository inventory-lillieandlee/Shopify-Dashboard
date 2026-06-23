// Shared types for the inventory data-access layer.

export type AlertLevel = "ok" | "yellow" | "red" | "critical";

export const CATEGORIES = [
  "supplement_chews",
  "cbd",
  "treats",
  "salmon_oil",
] as const;
export type Category = (typeof CATEGORIES)[number];

/**
 * One dashboard row: a product merged with its LATEST inventory snapshot and
 * LATEST projection. This is the stable contract the UI renders — it does not
 * change when the data source swaps from the dummy seed to the real Shopify
 * pipeline (both write the same Supabase tables).
 */
export interface InventoryRow {
  productId: string;
  shopifyProductId: string;
  name: string;
  category: Category;
  leadTimeDays: number;
  safetyStockDays: number;
  // from inventory_snapshots (latest)
  currentUnits: number | null; // shopify_units
  totalUnits: number | null; // shopify_units + tpl_units (generated)
  lastUpdated: string | null; // snapshot_at ISO timestamp
  // from projections (latest) — Phase 2 will populate these for real
  dailyDemandRate: number | null;
  daysOfStockRemaining: number | null;
  reorderDate: string | null; // YYYY-MM-DD
  spikePct: number | null;
  alertLevel: AlertLevel | null;
}
