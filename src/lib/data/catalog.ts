import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerComponentClient } from "@/lib/supabase/server";
import { availableFromCatalog, type CatalogRow, type CatalogOption } from "@/lib/products/rules";

// Seam readers for the product picker. Anon-RLS reads (shopify_catalog + products both have
// an anon SELECT policy), mirroring getInventoryRows/getMonthlySales — serializable output
// that passes straight from the server page into the client dialog. The pure filtering
// (exclude tracked, flag multi-variant) lives in products/rules.ts (unit-tested).
export type { CatalogOption } from "@/lib/products/rules";

export async function getAvailableCatalog(): Promise<CatalogOption[]> {
  return getAvailableCatalogWith(await createServerComponentClient());
}
export async function getAvailableCatalogWith(client: SupabaseClient): Promise<CatalogOption[]> {
  const [cat, prods] = await Promise.all([
    client.from("shopify_catalog").select("variant_id, shopify_product_id, title, sku, variant_title, status, variant_count"),
    client.from("products").select("shopify_variant_id, active"), // active = tracked (hide); inactive = removed (offer, labeled)
  ]);
  if (cat.error) throw new Error(`shopify_catalog: ${cat.error.message}`);
  if (prods.error) throw new Error(`products: ${prods.error.message}`);
  const activeIds = new Set<number>();
  const inactiveIds = new Set<number>();
  for (const p of (prods.data ?? []) as { shopify_variant_id: number | null; active: boolean }[]) {
    const v = Number(p.shopify_variant_id);
    if (!Number.isFinite(v)) continue;
    (p.active ? activeIds : inactiveIds).add(v);
  }
  return availableFromCatalog((cat.data ?? []) as CatalogRow[], activeIds, inactiveIds);
}

export interface AddingRow {
  id: string;
  name: string;
  category: string;
  history_status: string; // pending | building | failed
  history_cursor: string | null;
  history_target_month: string | null;
  history_error: string | null;
}

/**
 * Products mid-backfill or failed — the "Adding…" strip. These are active=false, so they
 * are NEVER in getInventoryRows (the main table) or readRecomputeInputs (the engine).
 */
export async function getAddingProducts(): Promise<AddingRow[]> {
  return getAddingProductsWith(await createServerComponentClient());
}
export async function getAddingProductsWith(client: SupabaseClient): Promise<AddingRow[]> {
  const { data, error } = await client
    .from("products")
    .select("id, name, category, history_status, history_cursor, history_target_month, history_error")
    .in("history_status", ["pending", "building", "failed"])
    .order("created_at", { ascending: false });
  if (error) throw new Error(`adding products: ${error.message}`);
  return (data ?? []) as AddingRow[];
}
