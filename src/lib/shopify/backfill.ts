// Phase H P2 — resumable, month-chunked history backfill (server-only; used by the
// backfill-worker cron). One product per tick; chunk = one shop-local calendar month
// (pulled in full, ~45 pages), monthly_sales upserted, cursor advanced. A timeout resumes
// at the cursor instead of restarting the ~270-page sweep. Terminal "__demand__" chunk
// writes sku_demand and flips ready/active.
//
// SCALING LIMIT (known, not fixed): Shopify orders can't be filtered by product, so each
// added product is its own full sweep — N adds = N sweeps. Fine while adds are rare. If a
// picker UI makes bulk-add normal, change the unit of work to ONE month shared across ALL
// pending products (one pull → aggregateSales already returns every product). Left as-is.

import type { SupabaseClient } from "@supabase/supabase-js";
import { shopifyRest, shopifyRestUrl } from "./client.ts";
import { aggregateSales, computeDemand, sellableOrders } from "./demand.ts";
import type { ShopifyOrder } from "./orders.ts";

export const DEMAND_STEP = "__demand__";

// ── pure month-key helpers (unit-tested) ──
export function monthIndex(key: string): number {
  const [y, m] = key.split("-").map(Number);
  return y * 12 + (m - 1);
}
export function monthKeyFromIndex(index: number): string {
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}
/** Inclusive month list floor..target ("YYYY-MM"); empty when floor > target. */
export function backfillMonths(floor: string, target: string): string[] {
  const out: string[] = [];
  for (let i = monthIndex(floor); i <= monthIndex(target); i++) out.push(monthKeyFromIndex(i));
  return out;
}
/** Cursor after finishing `current`: next month, or DEMAND_STEP once past target. */
export function advanceCursor(current: string, target: string): string {
  return monthIndex(current) >= monthIndex(target) ? DEMAND_STEP : monthKeyFromIndex(monthIndex(current) + 1);
}
/** Shop-local "YYYY-MM" for an instant. */
export function shopMonth(d: Date, timeZone: string): string {
  const p = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit" }).formatToParts(d);
  return `${p.find((x) => x.type === "year")!.value}-${p.find((x) => x.type === "month")!.value}`;
}

function parseNextLink(link: string | null): string | null {
  if (!link) return null;
  for (const part of link.split(",")) {
    const m = part.match(/<([^>]+)>;\s*rel="next"/);
    if (m) return m[1];
  }
  return null;
}
const ORDER_FIELDS = "id,created_at,cancelled_at,test,line_items,refunds";

async function pull(firstPath: string): Promise<ShopifyOrder[]> {
  let res = await shopifyRest<{ orders: ShopifyOrder[] }>(firstPath);
  const out: ShopifyOrder[] = [];
  for (;;) {
    if (res.status !== 200) throw new Error(`orders pull HTTP ${res.status}`); // 5xx/other → transient
    out.push(...(res.data?.orders ?? []));
    const next = parseNextLink(res.link);
    if (!next) break;
    res = await shopifyRestUrl<{ orders: ShopifyOrder[] }>(next);
  }
  return out;
}
// One shop-local month; over-pull ±1 day in UTC so tz edges are covered (aggregateSales
// keeps only orders whose shop-local month == mk). created_at_min + created_at_max ARE
// honored by Shopify (verified via orders/count.json). NOTE: a dense month is genuinely
// tens of thousands of store-wide orders (this store is front-loaded — Feb/Mar hold ~49k
// of ~67k), so a chunk can be minutes; the worker's month-chunking + the cron's spaced
// ticks are exactly what absorb that. See the scaling-limit note at the top.
function fetchMonthOrders(mk: string): Promise<ShopifyOrder[]> {
  const [y, m] = mk.split("-").map(Number);
  const min = new Date(Date.UTC(y, m - 1, 1) - 86_400_000).toISOString();
  const max = new Date(Date.UTC(y, m, 1) + 86_400_000).toISOString();
  return pull(
    `orders.json?status=any&limit=250&created_at_min=${encodeURIComponent(min)}&created_at_max=${encodeURIComponent(max)}&fields=${encodeURIComponent(ORDER_FIELDS)}`,
  );
}
function fetchTrailingOrders(now: Date): Promise<ShopifyOrder[]> {
  const min = new Date(now.getTime() - 31 * 86_400_000).toISOString();
  return pull(`orders.json?status=any&limit=250&created_at_min=${encodeURIComponent(min)}&fields=${encodeURIComponent(ORDER_FIELDS)}`);
}

class PermanentError extends Error {}

interface Claim {
  id: string;
  shopify_variant_id: number | null;
  history_cursor: string | null;
  history_target_month: string | null;
  history_auto_activate: boolean;
  history_attempts: number;
}
export interface BackfillTickResult {
  idle?: boolean;
  productId?: string;
  processed?: string[];
  cursor?: string | null;
  status?: "building" | "ready" | "failed";
  error?: string;
  attempts?: number;
}

const CLAIM_COLS =
  "id, shopify_variant_id, history_cursor, history_target_month, history_auto_activate, history_attempts";

/**
 * One worker tick: claim/resume ONE product and process month-chunks from its cursor
 * until the soft deadline or completion. Lease is held during the tick and released
 * (NULL) on a clean return with work remaining, so the next tick resumes immediately.
 */
export async function runBackfillTick(
  admin: SupabaseClient,
  now: Date,
  timeZone: string,
  opts: { leaseMs: number; softDeadlineMs: number; maxChunks?: number },
): Promise<BackfillTickResult> {
  const startedAt = Date.now();
  const nowIso = now.toISOString();
  const leaseUntil = new Date(now.getTime() + opts.leaseMs).toISOString();

  // ── PICKUP (1): resume a 'building' row with NULL or EXPIRED lease (optimistic re-acquire) ──
  let claim: Claim | null = null;
  const building = await admin
    .from("products")
    .select(`${CLAIM_COLS}, history_lease_until`)
    .eq("history_status", "building")
    .order("created_at", { ascending: true })
    .limit(5);
  if (building.error) throw new Error(`resume select: ${building.error.message}`);
  const cand = (building.data ?? []).find(
    (r) => !r.history_lease_until || new Date(r.history_lease_until as string) < now,
  ) as (Claim & { history_lease_until: string | null }) | undefined;
  if (cand) {
    // Re-acquire ONLY if the lease is unchanged since we read it (no other tick grabbed it).
    let q = admin.from("products").update({ history_lease_until: leaseUntil }).eq("id", cand.id).eq("history_status", "building");
    q = cand.history_lease_until == null ? q.is("history_lease_until", null) : q.eq("history_lease_until", cand.history_lease_until);
    const acq = await q.select(CLAIM_COLS).maybeSingle();
    if (!acq.error && acq.data) claim = acq.data as Claim;
  }

  // ── PICKUP (2): else claim the oldest 'pending' (atomic on the status guard) ──
  if (!claim) {
    const pend = await admin.from("products").select("id").eq("history_status", "pending").order("created_at", { ascending: true }).limit(1);
    if (pend.error) throw new Error(`pending select: ${pend.error.message}`);
    const pid = pend.data?.[0]?.id as string | undefined;
    if (pid) {
      const floorSel = await admin.from("monthly_sales").select("month").gt("units_sold", 0).order("month", { ascending: true }).limit(1);
      const floor = floorSel.data?.[0]?.month ? String(floorSel.data[0].month).slice(0, 7) : shopMonth(now, timeZone);
      const target = shopMonth(now, timeZone);
      const acq = await admin
        .from("products")
        .update({ history_status: "building", history_cursor: floor, history_target_month: target, history_lease_until: leaseUntil, history_error: null, history_attempts: 0 })
        .eq("id", pid)
        .eq("history_status", "pending")
        .select(CLAIM_COLS)
        .maybeSingle();
      if (!acq.error && acq.data) claim = acq.data as Claim;
    }
  }

  if (!claim) return { idle: true };

  const productId = claim.id;
  const variantId = claim.shopify_variant_id;
  const target = claim.history_target_month as string;
  let cursor = claim.history_cursor as string;
  const processed: string[] = [];

  try {
    if (variantId == null) throw new PermanentError("product has no shopify_variant_id");
    const maxChunks = opts.maxChunks ?? Number.POSITIVE_INFINITY;
    let chunks = 0;

    while (Date.now() - startedAt < opts.softDeadlineMs && chunks < maxChunks) {
      if (cursor !== DEMAND_STEP) {
        const orders = await fetchMonthOrders(cursor);
        const asOf = new Date(Date.UTC(Number(cursor.slice(0, 4)), Number(cursor.slice(5, 7)) - 1, 15, 12));
        const agg = aggregateSales(sellableOrders(orders), asOf, 1, timeZone); // monthKeys=[cursor]
        const units = Math.max(0, Math.round(agg.monthly.get(variantId)?.get(cursor) ?? 0));
        const up = await admin
          .from("monthly_sales")
          .upsert({ product_id: productId, month: `${cursor}-01`, units_sold: units, updated_at: nowIso }, { onConflict: "product_id,month" });
        if (up.error) throw new Error(`monthly_sales upsert: ${up.error.message}`);
        processed.push(cursor);
        cursor = advanceCursor(cursor, target);
        // persist cursor + reset attempts: a successful chunk clears prior transient count,
        // so scattered 429/5xx across months can't accumulate to a false 'failed'.
        await admin.from("products").update({ history_cursor: cursor, history_attempts: 0 }).eq("id", productId);
        chunks += 1;
      } else {
        const orders = await fetchTrailingOrders(now);
        const { units30, units7 } = computeDemand(sellableOrders(orders), now);
        const up = await admin.from("sku_demand").upsert(
          { product_id: productId, units_sold_30d: Math.max(0, units30.get(variantId) ?? 0), units_sold_7d: Math.max(0, units7.get(variantId) ?? 0), computed_at: nowIso },
          { onConflict: "product_id" },
        );
        if (up.error) throw new Error(`sku_demand upsert: ${up.error.message}`);
        await admin
          .from("products")
          .update({ history_status: "ready", active: claim.history_auto_activate, history_cursor: null, history_target_month: null, history_lease_until: null, history_error: null, history_attempts: 0 })
          .eq("id", productId);
        return { productId, processed, cursor: null, status: "ready" };
      }
    }
    // clean return, months remain → advance already persisted; RELEASE the lease (amendment 1)
    await admin.from("products").update({ history_lease_until: null }).eq("id", productId);
    return { productId, processed, cursor, status: "building" };
  } catch (e) {
    const attempts = (claim.history_attempts ?? 0) + 1;
    if (e instanceof PermanentError || attempts > 3) {
      await admin
        .from("products")
        .update({ history_status: "failed", history_error: String(e).slice(0, 500), history_lease_until: null, history_attempts: attempts })
        .eq("id", productId);
      return { productId, processed, status: "failed", error: String(e), attempts };
    }
    // transient (5xx / exhausted-429): do NOT advance; release lease; bump attempts → free resume
    await admin.from("products").update({ history_lease_until: null, history_attempts: attempts }).eq("id", productId);
    return { productId, processed, cursor, status: "building", error: String(e), attempts };
  }
}
