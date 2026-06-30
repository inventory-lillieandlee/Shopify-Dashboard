import { createServerComponentClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AlertLevel, Category, InventoryRow } from "./types";

// Minimal shapes for the columns we select (no generated DB types yet).
interface ProductRow {
  id: string;
  shopify_product_id: number;
  name: string;
  category: string;
  lead_time_days: number;
  safety_stock_days: number;
}
interface SnapshotRow {
  product_id: string;
  shopify_units: number;
  total_units: number;
  snapshot_at: string;
}
interface ProjectionRow {
  product_id: string;
  daily_demand_rate: number | string | null;
  days_of_stock_remaining: number | string | null;
  reorder_date: string | null;
  spike_pct: number | string | null;
  alert_level: string | null;
  calculated_at: string;
}

const toNum = (v: number | string | null | undefined): number | null =>
  v === null || v === undefined ? null : Number(v);

/**
 * THE DATA-ACCESS SEAM.
 *
 * Every part of the dashboard reads inventory through this single function. It
 * returns one row per active product, merged with that product's LATEST snapshot
 * and LATEST projection.
 *
 * Today these tables are filled by supabase/seed-dummy.sql. When the real Shopify
 * webhook/backfill pipeline lands, it writes to the SAME tables — this function
 * and the entire UI above it stay unchanged; only the ingestion changes.
 *
 * NOTE: latest-per-product is computed here in JS (fine for 19 SKUs). If snapshot
 * volume grows, this can be swapped for a Postgres view/RPC behind this same
 * signature without touching any component.
 */
export async function getInventoryRows(): Promise<InventoryRow[]> {
  // Public seam — cookie/session-aware client (anon when no session → identical
  // output in dormant mode; the signed-in user's session once auth is live).
  // Signature, queries, and returned shape are unchanged.
  return getInventoryRowsWith(await createServerComponentClient());
}

/**
 * Same merge as the seam but with an INJECTABLE client. The 6h cron passes the
 * service-role admin client — it has no user session and, after the RLS cutover,
 * the anon path returns nothing. The dashboard always uses getInventoryRows().
 */
export async function getInventoryRowsWith(supabase: SupabaseClient): Promise<InventoryRow[]> {
  const [products, snapshots, projections] = await Promise.all([
    supabase
      .from("products")
      .select("id, shopify_product_id, name, category, lead_time_days, safety_stock_days")
      .eq("active", true)
      .order("name"),
    supabase
      .from("inventory_snapshots")
      .select("product_id, shopify_units, total_units, snapshot_at")
      .order("snapshot_at", { ascending: false }),
    supabase
      .from("projections")
      .select(
        "product_id, daily_demand_rate, days_of_stock_remaining, reorder_date, spike_pct, alert_level, calculated_at",
      )
      .order("calculated_at", { ascending: false }),
  ]);

  if (products.error) throw new Error(`products: ${products.error.message}`);
  if (snapshots.error) throw new Error(`inventory_snapshots: ${snapshots.error.message}`);
  if (projections.error) throw new Error(`projections: ${projections.error.message}`);

  // Rows arrive newest-first, so the first time we see a product_id is its latest.
  const latestSnapshot = new Map<string, SnapshotRow>();
  for (const s of (snapshots.data ?? []) as SnapshotRow[]) {
    if (!latestSnapshot.has(s.product_id)) latestSnapshot.set(s.product_id, s);
  }
  const latestProjection = new Map<string, ProjectionRow>();
  for (const p of (projections.data ?? []) as ProjectionRow[]) {
    if (!latestProjection.has(p.product_id)) latestProjection.set(p.product_id, p);
  }

  return ((products.data ?? []) as ProductRow[]).map((p): InventoryRow => {
    const s = latestSnapshot.get(p.id);
    const pr = latestProjection.get(p.id);
    return {
      productId: p.id,
      shopifyProductId: String(p.shopify_product_id),
      name: p.name,
      category: p.category as Category,
      leadTimeDays: p.lead_time_days,
      safetyStockDays: p.safety_stock_days,
      currentUnits: toNum(s?.shopify_units),
      totalUnits: toNum(s?.total_units),
      lastUpdated: s?.snapshot_at ?? null,
      dailyDemandRate: toNum(pr?.daily_demand_rate),
      daysOfStockRemaining: toNum(pr?.days_of_stock_remaining),
      reorderDate: pr?.reorder_date ?? null,
      spikePct: toNum(pr?.spike_pct),
      alertLevel: (pr?.alert_level as AlertLevel | undefined) ?? null,
    };
  });
}
