// Shared sales/demand writers — ONE code path for monthly_sales + sku_demand, used by
// BOTH the daily cron and the backfill script. Node-safe: imports only ./demand.ts
// (whose sole import is a type) and takes a SupabaseClient + pre-pulled orders, so it
// never pulls Shopify itself (the caller does one pull and feeds both writers).

import type { SupabaseClient } from "@supabase/supabase-js";
import { aggregateSales, computeDemand, sellableOrders, type SalesAggregate } from "./demand.ts";
import type { ShopifyOrder } from "./orders.ts";

export interface ProductRef {
  id: string;
  shopify_variant_id: number | null;
}

/**
 * The order-pull start for the monthly refresh: the first instant (UTC) of the PREVIOUS
 * month, OR now−31d if that is earlier. The min() guards the month-start edge — on e.g.
 * the 1st–2nd, the previous month began fewer than 31 days ago, so now−31d reaches
 * further back and keeps the trailing-30d demand window fully covered. Guarantees the
 * pull spans BOTH the entire previous month and the 30-day demand window. Exported so
 * the demand-sync cron and the month-boundary test share ONE definition (no drift).
 */
export function monthlyRefreshSince(now: Date): Date {
  const firstOfPrevMonth = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1);
  return new Date(Math.min(firstOfPrevMonth, now.getTime() - 31 * 86_400_000));
}

/**
 * Aggregate real sales (cancelled + test excluded, refunds netted to the sale month)
 * and upsert monthly_sales for the aggregate's month keys. Idempotent on
 * (product_id, month); sets updated_at on EVERY write (upsert doesn't auto-bump it).
 * Returns the aggregate so the caller can reuse it (e.g. the backfill's report).
 */
export async function syncMonthlySales(
  admin: SupabaseClient,
  products: ProductRef[],
  orders: ShopifyOrder[],
  now: Date,
  monthsBack: number,
  timeZone = "UTC",
): Promise<{ upserted: number; monthKeys: string[]; aggregate: SalesAggregate }> {
  const agg = aggregateSales(sellableOrders(orders), now, monthsBack, timeZone);
  const stamp = now.toISOString();
  const rows: { product_id: string; month: string; units_sold: number; updated_at: string }[] = [];
  for (const p of products) {
    if (p.shopify_variant_id == null) continue;
    const m = agg.monthly.get(Number(p.shopify_variant_id)) ?? new Map<string, number>();
    for (const k of agg.monthKeys) {
      rows.push({ product_id: p.id, month: `${k}-01`, units_sold: Math.max(0, Math.round(m.get(k) ?? 0)), updated_at: stamp });
    }
  }
  if (rows.length) {
    const { error } = await admin.from("monthly_sales").upsert(rows, { onConflict: "product_id,month" });
    if (error) throw new Error(`monthly_sales upsert: ${error.message}`);
  }
  return { upserted: rows.length, monthKeys: agg.monthKeys, aggregate: agg };
}

/**
 * Upsert sku_demand from the SAME order set. computeDemand filters its own trailing
 * 30d/7d window internally, so passing a wider pull does not change the demand math —
 * only the shared cancelled/test exclusion applies. Idempotent on product_id.
 */
export async function syncDemand(
  admin: SupabaseClient,
  products: ProductRef[],
  orders: ShopifyOrder[],
  now: Date,
): Promise<{ updated: number }> {
  const { units30, units7 } = computeDemand(sellableOrders(orders), now);
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
  if (rows.length) {
    const { error } = await admin.from("sku_demand").upsert(rows, { onConflict: "product_id" });
    if (error) throw new Error(`sku_demand upsert: ${error.message}`);
  }
  return { updated: rows.length };
}
