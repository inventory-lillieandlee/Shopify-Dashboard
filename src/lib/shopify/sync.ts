// Server-only sync orchestration: pull from Shopify, write to Supabase via the
// service-role admin client. Used by the cron routes.

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchInventoryLevels } from "./inventory";

// NOTE: demand + monthly-sales writers moved to ./sales-sync.ts (one code path shared
// by the cron and the backfill). This module keeps the inventory refresh.

/**
 * Cheap inventory refresh (one GraphQL call): fresh `available` per SKU at the Shop
 * location → a new inventory_snapshots row. `available` (sellable, = the admin's
 * default column) is the displayed number; on_hand + committed are stored for
 * reference. NOT clamped — negatives (oversold) are stored as-is so the dashboard
 * matches the admin. Runs on the 6h cron before recompute.
 */
export async function refreshInventory(
  admin: SupabaseClient,
  now: Date,
): Promise<{ written: number }> {
  const { data, error } = await admin
    .from("products")
    .select("id, inventory_item_id")
    .eq("active", true);
  if (error) throw new Error(`products: ${error.message}`);
  const products = (data ?? []) as { id: string; inventory_item_id: number | null }[];

  const withIii = products.filter((p) => p.inventory_item_id != null);
  const levels = await fetchInventoryLevels(withIii.map((p) => Number(p.inventory_item_id)));

  const rows = withIii.map((p) => {
    const lv = levels.get(String(p.inventory_item_id));
    const available = lv?.available ?? null;
    return {
      product_id: p.id,
      // Displayed "current units" = available, unclamped. NOT NULL column, so a
      // Shopify-absent item defaults to 0; shopify_units_raw preserves the true value.
      shopify_units: available ?? 0,
      shopify_units_raw: available,
      shopify_on_hand: lv?.onHand ?? null,
      shopify_committed: lv?.committed ?? null,
      tpl_units: 0,
      source: "shopify",
      snapshot_at: now.toISOString(),
    };
  });
  if (rows.length === 0) return { written: 0 };

  const { error: insErr } = await admin.from("inventory_snapshots").insert(rows);
  if (insErr) throw new Error(`inventory_snapshots insert: ${insErr.message}`);
  return { written: rows.length };
}
