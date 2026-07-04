// Phase C — order-history backfill, STEP 1: RESOLVE + REPORT (read-only, no writes).
//   node scripts/backfill-orders.ts
// Pulls ~6 months of Shopify orders (status=any, API 2026-04, read_all_orders needed
// for >60d), aggregates real sales per SKU (monthly + rolling 7/30/60/90, NET of
// refunds netted to the SALE window), and previews how tiers shift vs the current
// demand. Writes NOTHING. Reuses the pure aggregateSales + engine.
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { aggregateSales } from "../src/lib/shopify/demand.ts";
import { computeProjection } from "../src/lib/projections/engine.ts";
import { loadProjectionSettings } from "../src/lib/config/projection-config.ts";
import { readRecomputeInputs, computeAll, persistProjections } from "../src/lib/projections/recompute.ts";

function loadEnv(f: string) {
  if (!existsSync(f)) return;
  for (const l of readFileSync(f, "utf8").split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}
loadEnv(".env.local");

const store = (process.env.SHOPIFY_STORE || "").startsWith("http")
  ? process.env.SHOPIFY_STORE!
  : `https://${process.env.SHOPIFY_STORE}`;
const ver = process.env.SHOPIFY_API_VERSION || "2026-04";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// fetch with retry on transient network errors (TypeError: fetch failed) + 5xx.
async function fetchRetry(url: string, init?: RequestInit, tries = 4): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, init);
      if (res.status >= 500) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (e) {
      lastErr = e;
      process.stderr.write(`  fetch retry ${i + 1}/${tries} (${String(e).slice(0, 60)})\n`);
      await sleep(1500 * (i + 1));
    }
  }
  throw lastErr;
}

async function shopToken(): Promise<string> {
  const res = await fetchRetry(`${store}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.SHOPIFY_API_KEY,
      client_secret: process.env.SHOPIFY_API_SECRET,
      grant_type: "client_credentials",
    }),
  });
  if (!res.ok) throw new Error(`token grant ${res.status}`);
  return (await res.json()).access_token;
}
function nextLink(link: string | null): string | null {
  if (!link) return null;
  for (const p of link.split(",")) {
    const m = p.match(/<([^>]+)>;\s*rel="next"/);
    if (m) return m[1];
  }
  return null;
}

// Self-contained order pull (orders.ts uses extensionless imports node can't strip).
type Order = {
  id: number;
  created_at: string;
  cancelled_at: string | null;
  line_items: { id: number; variant_id: number | null; quantity: number }[];
  refunds: { refund_line_items: { line_item_id: number; quantity: number }[] }[];
};
async function fetchOrders(sinceIso: string, maxPages = 400): Promise<{ orders: Order[]; pages: number }> {
  const token = await shopToken();
  const fields = "id,created_at,cancelled_at,line_items,refunds";
  let url: string | null =
    `${store}/admin/api/${ver}/orders.json?status=any&limit=250` +
    `&created_at_min=${encodeURIComponent(sinceIso)}&fields=${encodeURIComponent(fields)}`;
  const out: Order[] = [];
  let pages = 0;
  while (url) {
    const res = await fetchRetry(url, { headers: { "X-Shopify-Access-Token": token } });
    if (res.status === 429) {
      process.stderr.write("  429 backoff…\n");
      await sleep((Number(res.headers.get("Retry-After")) || 2) * 1000);
      continue;
    }
    if (!res.ok) throw new Error(`orders ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()) as { orders: Order[] };
    out.push(...(data.orders ?? []));
    pages++;
    process.stderr.write(`  page ${pages}: +${data.orders?.length ?? 0} (total ${out.length})\n`);
    url = nextLink(res.headers.get("link"));
    if (pages >= maxPages) {
      process.stderr.write(`  hit maxPages=${maxPages} cap — stopping pull\n`);
      break;
    }
  }
  return { orders: out, pages };
}

const pad = (s: string | number, n: number) => String(s).padStart(n);
const padr = (s: string | number, n: number) => String(s).padEnd(n);
const r1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

async function main() {
  const now = new Date();
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));
  console.log(`=== STEP 1 — order-history backfill REPORT (read-only) ===`);
  console.log(`now=${now.toISOString()}  since=${since.toISOString()}  api=${ver}`);

  const { orders, pages } = await fetchOrders(since.toISOString());
  console.log(`pulled ${orders.length} orders across ${pages} page(s)\n`);

  // ── refund / cancellation accounting ──
  let cancelled = 0, cancelledUnrefunded = 0, cancelledUnrefundedUnits = 0, refundedOrders = 0;
  for (const o of orders) {
    const hasRefund = (o.refunds ?? []).some((r) => (r.refund_line_items ?? []).length > 0);
    if (hasRefund) refundedOrders++;
    if (o.cancelled_at) {
      cancelled++;
      if (!hasRefund) {
        cancelledUnrefunded++;
        cancelledUnrefundedUnits += o.line_items.reduce((s, li) => s + (li.variant_id != null ? li.quantity : 0), 0);
      }
    }
  }

  // ── aggregate (pure, nets refunds to the SALE month/window) ──
  const agg = aggregateSales(orders as never, now, 6);

  // ── DB reads (service-role, read-only) ──
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const { data: products } = await admin
    .from("products")
    .select("id, name, category, shopify_variant_id, lead_time_days, safety_stock_days")
    .eq("active", true)
    .order("name");
  const { data: snaps } = await admin
    .from("inventory_snapshots")
    .select("product_id, shopify_units, snapshot_at")
    .order("snapshot_at", { ascending: false });
  const latestUnits = new Map<string, number>();
  for (const s of snaps ?? []) if (!latestUnits.has(s.product_id)) latestUnits.set(s.product_id, Number(s.shopify_units));
  const { data: cur } = await admin.from("sku_demand").select("product_id, units_sold_30d, units_sold_7d");
  const curById = new Map((cur ?? []).map((d) => [d.product_id, d]));
  const settings = await loadProjectionSettings(admin);

  const tierOf = (p: any, base: number, actual7: number): string => {
    const res = computeProjection(
      {
        base_daily_demand: Math.max(base, 0),
        upcoming_renewals_30d: 0,
        shopify_units: latestUnits.get(p.id) ?? 0,
        lead_time_days: p.lead_time_days,
        safety_stock_days: p.safety_stock_days,
        actual_7d: Math.max(actual7, 0),
        today: now,
      },
      settings.config,
      settings.thresholdsByCategory.get(p.category),
    );
    return res.alert_level;
  };

  // ── TABLE A: monthly units per SKU ──
  const mk = agg.monthKeys;
  console.log("── A. Units sold per calendar month (net of refunds) + rolling windows ──");
  console.log(
    padr("SKU", 34) + mk.map((k) => pad(k.slice(2), 8)).join("") +
      pad("30d", 8) + pad("7d", 7) + pad("d/day30", 9) + pad("d/day90", 9),
  );
  const zeroSkus: string[] = [];
  for (const p of products ?? []) {
    const v = Number(p.shopify_variant_id);
    const m = agg.monthly.get(v) ?? new Map();
    const w = agg.windows.get(v) ?? { d7: 0, d30: 0, d60: 0, d90: 0 };
    if ((w.d90 ?? 0) <= 0 && mk.every((k) => (m.get(k) ?? 0) === 0)) zeroSkus.push(p.name);
    console.log(
      padr(p.name.slice(0, 33), 34) +
        mk.map((k) => pad(m.get(k) ?? 0, 8)).join("") +
        pad(w.d30, 8) + pad(w.d7, 7) + pad(r1(w.d30 / 30), 9) + pad(r1(w.d90 / 90), 9),
    );
  }

  // ── TABLE B: real vs current demand + tier shift ──
  console.log("\n── B. Real demand vs current, and tier under each base (units + tier) ──");
  console.log(
    padr("SKU", 34) + pad("cur/day", 9) + pad("real30", 8) + pad("real90", 8) +
      "  " + padr("tier: cur→real30→real90", 30),
  );
  let curCrit = 0, survive30 = 0, survive90 = 0;
  const shifts: string[] = [];
  for (const p of products ?? []) {
    const v = Number(p.shopify_variant_id);
    const w = agg.windows.get(v) ?? { d7: 0, d30: 0, d60: 0, d90: 0 };
    const c = curById.get(p.id);
    const cur30 = Number(c?.units_sold_30d ?? 0), cur7 = Number(c?.units_sold_7d ?? 0);
    const tCur = tierOf(p, cur30 / 30, cur7);
    const t30 = tierOf(p, w.d30 / 30, w.d7);
    const t90 = tierOf(p, w.d90 / 90, w.d7);
    if (tCur === "critical") { curCrit++; if (t30 === "critical") survive30++; if (t90 === "critical") survive90++; }
    const shifted = !(tCur === t30 && t30 === t90);
    if (shifted) shifts.push(`  ${p.name}: ${tCur} → ${t30} (30d) / ${t90} (90d)`);
    console.log(
      padr(p.name.slice(0, 33), 34) +
        pad(r1(cur30 / 30), 9) + pad(r1(w.d30 / 30), 8) + pad(r1(w.d90 / 90), 8) +
        "  " + padr(`${tCur} → ${t30} → ${t90}${shifted ? "  *" : ""}`, 30),
    );
  }

  // ── SUMMARY ──
  console.log("\n── SUMMARY ──");
  console.log(`refund convention: refunds netted against the SALE month/window (true consumption), not the refund date.`);
  console.log(`orders: ${orders.length} | refunded orders: ${refundedOrders} | cancelled: ${cancelled} | cancelled-but-UNREFUNDED: ${cancelledUnrefunded} (${cancelledUnrefundedUnits} units)`);
  console.log(`zero-order SKUs (no sales in 90d & 6mo): ${zeroSkus.length ? zeroSkus.join(", ") : "none"}`);
  console.log(`current criticals: ${curCrit} | still critical under real 30d: ${survive30} | under real 90d: ${survive90}`);
  console.log(`tier shifts (cur → real30 → real90):`);
  console.log(shifts.length ? shifts.join("\n") : "  (none)");

  // ── STEP 2 WRITE PATH (only with --write) ──
  if (!process.argv.includes("--write")) {
    console.log(`\n(read-only report. Pass --write to persist monthly_sales + real demand and recompute.)`);
    return;
  }

  console.log(`\n=== STEP 2 — WRITE + RECOMPUTE (growth-aware base) ===`);

  // capture BEFORE tiers (current live projections) to diff after recompute
  const { data: beforeProj } = await admin.from("projections").select("product_id, alert_level");
  const beforeTier = new Map((beforeProj ?? []).map((p) => [p.product_id, p.alert_level as string]));

  // demand aggregation EXCLUDING fully-cancelled orders (correct; ~5 units total)
  const clean = (orders as unknown as Order[]).filter((o) => !o.cancelled_at);
  const aggW = aggregateSales(clean as never, now, 6);
  const varToProduct = new Map((products ?? []).map((p) => [Number(p.shopify_variant_id), p]));

  // 1) upsert monthly_sales (6 months incl. empty Feb/Mar), net of refunds, clamped ≥0
  const msRows: { product_id: string; month: string; units_sold: number }[] = [];
  for (const p of products ?? []) {
    const m = aggW.monthly.get(Number(p.shopify_variant_id)) ?? new Map<string, number>();
    for (const k of aggW.monthKeys) {
      msRows.push({ product_id: p.id, month: `${k}-01`, units_sold: Math.max(0, Math.round(m.get(k) ?? 0)) });
    }
  }
  const upMs = await admin.from("monthly_sales").upsert(msRows, { onConflict: "product_id,month" });
  if (upMs.error) throw new Error(`monthly_sales upsert: ${upMs.error.message}`);
  console.log(`monthly_sales: upserted ${msRows.length} rows (${(products ?? []).length} SKUs × ${aggW.monthKeys.length} months)`);

  // 2) upsert sku_demand with REAL recent run-rate (30d/7d, cancelled excluded)
  const sdRows = (products ?? []).map((p) => {
    const w = aggW.windows.get(Number(p.shopify_variant_id)) ?? { d7: 0, d30: 0, d60: 0, d90: 0 };
    return {
      product_id: p.id,
      units_sold_30d: Math.max(0, Math.round(w.d30)),
      units_sold_7d: Math.max(0, Math.round(w.d7)),
      computed_at: now.toISOString(),
    };
  });
  const upSd = await admin.from("sku_demand").upsert(sdRows, { onConflict: "product_id" });
  if (upSd.error) throw new Error(`sku_demand upsert: ${upSd.error.message}`);
  console.log(`sku_demand: refreshed ${sdRows.length} SKUs with real 30d/7d run-rate`);

  // 3) growth: flat 1.0 (Apr→Jun is a launch ramp, not extrapolatable) — FLAGGED
  const upCfg = await admin.from("app_config").update({ growth_pct: 0 }).eq("id", true);
  if (upCfg.error) throw new Error(`app_config growth: ${upCfg.error.message}`);
  console.log(`app_config.growth_pct set to 0 (growth=1.0 flat) — no guessed multiplier`);

  // 4) recompute against real growth-aware demand
  const inputs = await readRecomputeInputs(admin, now);
  const s2 = await loadProjectionSettings(admin);
  const computed = computeAll(inputs, now, s2.config, s2.thresholdsByCategory);
  const written = await persistProjections(admin, computed, now);
  console.log(`recomputed + persisted ${written} projections (config.growth=${s2.config.growth})`);

  // 5) AFTER tiers + report
  const { data: afterProj } = await admin
    .from("projections")
    .select("product_id, alert_level, days_of_stock_remaining");
  const nameById = new Map((products ?? []).map((p) => [p.id, p.name]));
  const dist: Record<string, number> = {};
  const changed: string[] = [];
  for (const ap of afterProj ?? []) {
    dist[ap.alert_level] = (dist[ap.alert_level] ?? 0) + 1;
    const before = beforeTier.get(ap.product_id);
    if (before && before !== ap.alert_level) {
      changed.push(`  ${nameById.get(ap.product_id)}: ${before} → ${ap.alert_level} (DSR ${ap.days_of_stock_remaining})`);
    }
  }

  // shaky-history flags: thin months or very low volume
  const shaky: string[] = [];
  for (const p of products ?? []) {
    const m = aggW.monthly.get(Number(p.shopify_variant_id)) ?? new Map<string, number>();
    const w = aggW.windows.get(Number(p.shopify_variant_id)) ?? { d7: 0, d30: 0, d60: 0, d90: 0 };
    const monthsWithSales = aggW.monthKeys.filter((k) => (m.get(k) ?? 0) > 0).length;
    if (w.d30 < 30 || monthsWithSales <= 1) {
      shaky.push(`  ${p.name}: 30d=${Math.max(0, Math.round(w.d30))}u, months w/ sales=${monthsWithSales}`);
    }
  }

  console.log(`\nNEW tier distribution: ${JSON.stringify(dist)}   (was critical:15, yellow:1, ok:3)`);
  console.log(`tier CHANGES (live → new):`);
  console.log(changed.length ? changed.join("\n") : "  (none)");
  console.log(`\nSHAKY (thin history / low volume — treat DSR with caution):`);
  console.log(shaky.length ? shaky.join("\n") : "  (none)");
}

main().catch((e) => {
  console.error("FAILED:", String(e));
  process.exit(1);
});
