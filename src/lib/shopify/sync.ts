// Server-only sync orchestration: pull from Shopify, write to Supabase via the
// service-role admin client. Used by the cron routes.

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchOrdersSince } from "./orders";
import { computeDemand } from "./demand";
import { fetchOnHand } from "./inventory";

/**
 * Daily demand sync: pull the last 30 days of orders, compute net units sold per
 * variant, map to our SKUs, and upsert sku_demand. Heavy (high order volume) — runs
 * on its own daily cron, not the 6h path.
 */
export async function syncDemand(
  admin: SupabaseClient,
  now: Date,
): Promise<{ updated: number; orders: number }> {
  const { data, error } = await admin
    .from("products")
    .select("id, shopify_variant_id")
    .eq("active", true);
  if (error) throw new Error(`products: ${error.message}`);
  const products = (data ?? []) as { id: string; shopify_variant_id: number | null }[];

  const since = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const orders = await fetchOrdersSince(since);
  const { units30, units7 } = computeDemand(orders, now);

  const rows = products
    .filter((p) => p.shopify_variant_id != null)
    .map((p) => {
      const v = Number(p.shopify_variant_id);
      return {
        product_id: p.id,
        units_sold_30d: Math.max(units30.get(v) ?? 0, 0),
        units_sold_7d: Math.max(units7.get(v) ?? 0, 0),
        computed_at: now.toISOString(),
      };
    });

  const { error: upErr } = await admin.from("sku_demand").upsert(rows, { onConflict: "product_id" });
  if (upErr) throw new Error(`sku_demand upsert: ${upErr.message}`);
  return { updated: rows.length, orders: orders.length };
}

/**
 * Cheap inventory refresh (one GraphQL call): fresh on_hand per SKU at the Shop
 * location → a new inventory_snapshots row (clamped at 0, raw preserved). Runs on
 * the 6h cron before recompute.
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
  const onHand = await fetchOnHand(withIii.map((p) => Number(p.inventory_item_id)));

  const rows = withIii.map((p) => {
    const raw = onHand.get(String(p.inventory_item_id)) ?? null;
    return {
      product_id: p.id,
      shopify_units: Math.max(raw ?? 0, 0),
      shopify_units_raw: raw,
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
