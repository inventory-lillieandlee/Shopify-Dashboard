// Shopify catalog sync — pull the full product/variant list and UPSERT-LATEST into
// shopify_catalog (keyed on variant_id; NOT append-only). Feeds the add-product picker.
// Server-only (uses the Admin client + service-role Supabase). One row per variant.

import type { SupabaseClient } from "@supabase/supabase-js";
import { shopifyRest, shopifyRestUrl } from "./client";

export interface CatalogEntry {
  variant_id: number;
  shopify_product_id: number;
  inventory_item_id: number | null;
  title: string;
  sku: string | null;
  variant_title: string | null;
  status: string;
  variant_count: number;
}

interface ShopifyVariant {
  id: number;
  inventory_item_id: number | null;
  title: string | null;
  sku: string | null;
}
interface ShopifyProduct {
  id: number;
  title: string;
  status: string;
  variants: ShopifyVariant[];
}

function parseNextLink(link: string | null): string | null {
  if (!link) return null;
  for (const part of link.split(",")) {
    const m = part.match(/<([^>]+)>;\s*rel="next"/);
    if (m) return m[1];
  }
  return null;
}

/**
 * Pull every product (all statuses) and flatten to one CatalogEntry per variant.
 * NOTE: Shopify's products endpoint does NOT accept `status=any` (that's an orders
 * param) — omitting status returns all statuses. Cursor-paginated.
 */
export async function fetchShopifyCatalog(maxPages = 20): Promise<CatalogEntry[]> {
  const out: CatalogEntry[] = [];
  let res = await shopifyRest<{ products: ShopifyProduct[] }>(
    "products.json?limit=250&fields=id,title,status,variants",
  );
  let pages = 0;
  for (;;) {
    if (res.status !== 200) throw new Error(`catalog pull HTTP ${res.status}`);
    for (const p of res.data?.products ?? []) {
      const variant_count = (p.variants ?? []).length;
      for (const v of p.variants ?? []) {
        out.push({
          variant_id: v.id,
          shopify_product_id: p.id,
          inventory_item_id: v.inventory_item_id ?? null,
          title: p.title,
          sku: v.sku || null,
          variant_title: v.title || null,
          status: p.status,
          variant_count,
        });
      }
    }
    pages += 1;
    const next = parseNextLink(res.link);
    if (!next || pages >= maxPages) break;
    res = await shopifyRestUrl<{ products: ShopifyProduct[] }>(next);
  }
  return out;
}

/** Pull + upsert the catalog. Idempotent on variant_id; stamps synced_at/updated_at. */
export async function syncCatalog(
  admin: SupabaseClient,
  now: Date,
): Promise<{ variants: number; products: number }> {
  const entries = await fetchShopifyCatalog();
  const stamp = now.toISOString();
  const rows = entries.map((e) => ({ ...e, synced_at: stamp, updated_at: stamp }));
  if (rows.length) {
    const { error } = await admin.from("shopify_catalog").upsert(rows, { onConflict: "variant_id" });
    if (error) throw new Error(`shopify_catalog upsert: ${error.message}`);
  }
  return { variants: rows.length, products: new Set(entries.map((e) => e.shopify_product_id)).size };
}
