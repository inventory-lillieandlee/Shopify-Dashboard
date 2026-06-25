// Phase A recompute routine — math-free DB I/O.
// READS via the public anon key (RLS allows SELECT). COMPUTES with the pure
// engine. PRINTS the idempotent upsert SQL — which is then run through the
// Supabase MCP (reviewed write; no service-role key on disk).
//
//   node scripts/recompute-projections.ts        # prints SUMMARY + SQL
import { readFileSync, existsSync } from "node:fs";
import {
  computeDDR,
  computeProjection,
  projected7d,
  DEFAULT_CONFIG,
} from "../src/lib/projections/engine.ts";

function loadEnv(f: string) {
  if (!existsSync(f)) return;
  for (const l of readFileSync(f, "utf8").split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  }
}
loadEnv(".env");
loadEnv(".env.local");

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!URL_ || !KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY");
  process.exit(1);
}
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const rest = async (path: string) => {
  const r = await fetch(`${URL_}/rest/v1/${path}`, { headers: H });
  if (!r.ok) throw new Error(`GET ${path} -> ${r.status} ${await r.text()}`);
  return r.json();
};

interface Product { id: string; shopify_product_id: number; name: string; category: string; lead_time_days: number; safety_stock_days: number; }
interface Snap { product_id: string; shopify_units: number; snapshot_at: string; }
interface Proj { product_id: string; daily_demand_rate: number | string | null; spike_pct: number | string | null; calculated_at: string; }
interface Renewal { product_id: string; expected_units: number; renewal_date: string; }

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

const today = new Date();
const horizon30 = new Date(today);
horizon30.setUTCDate(horizon30.getUTCDate() + 30);

const products: Product[] = await rest("products?active=eq.true&select=id,shopify_product_id,name,category,lead_time_days,safety_stock_days&order=name");
const snaps: Snap[] = await rest("inventory_snapshots?select=product_id,shopify_units,snapshot_at&order=snapshot_at.desc");
const projs: Proj[] = await rest("projections?select=product_id,daily_demand_rate,spike_pct,calculated_at&order=calculated_at.desc");
const renewals: Renewal[] = await rest("recharge_renewals?select=product_id,expected_units,renewal_date");

const latestSnap = new Map<string, Snap>();
for (const s of snaps) if (!latestSnap.has(s.product_id)) latestSnap.set(s.product_id, s);
const latestProj = new Map<string, Proj>();
for (const p of projs) if (!latestProj.has(p.product_id)) latestProj.set(p.product_id, p);
const renewalsByProduct = new Map<string, number>();
for (const r of renewals) {
  const d = new Date(r.renewal_date);
  if (d >= today && d <= horizon30) renewalsByProduct.set(r.product_id, (renewalsByProduct.get(r.product_id) ?? 0) + num(r.expected_units));
}

const growth = DEFAULT_CONFIG.growth;
const rows: { p: Product; units: number; r: ReturnType<typeof computeProjection> }[] = [];

for (const p of products) {
  const snap = latestSnap.get(p.id);
  const proj = latestProj.get(p.id);
  if (!snap) { console.error(`! ${p.name}: no inventory_snapshot — skipped`); continue; }

  const seededDDR = num(proj?.daily_demand_rate);
  // DEMO bootstrap to reconstruct seeded run-rate — REPLACE with units_sold_30d/30
  // when real order history lands. (ddr_out == ddr_in ⇒ idempotent.)
  const base_daily_demand = seededDDR / growth;
  const upcoming_renewals_30d = renewalsByProduct.get(p.id) ?? 0;
  const ddr = computeDDR({ base_daily_demand, upcoming_renewals_30d }, DEFAULT_CONFIG);

  const seededSpike = num(proj?.spike_pct);
  // DEMO back-derivation: no 7-day sales history exists, so reconstruct actual_7d
  // from the seeded spike — REPLACE with real units-sold-last-7-days when order
  // history lands. Preserves the seeded spike (idempotent).
  const actual_7d = projected7d(ddr) * (1 + seededSpike / 100);

  const r = computeProjection({
    base_daily_demand, upcoming_renewals_30d, shopify_units: snap.shopify_units,
    lead_time_days: p.lead_time_days, safety_stock_days: p.safety_stock_days, actual_7d, today,
  }, DEFAULT_CONFIG);
  rows.push({ p, units: snap.shopify_units, r });
}

// ── SUMMARY (for review) ─────────────────────────────────────────────────────
console.log("=== SUMMARY (computed projections) ===");
const tally: Record<string, number> = { ok: 0, yellow: 0, red: 0, critical: 0 };
for (const { p, units, r } of rows) {
  tally[r.alert_level]++;
  const dsr = Number.isFinite(r.days_of_stock_remaining) ? r.days_of_stock_remaining.toFixed(1) : "∞";
  const ro = r.reorder_date ? r.reorder_date.toISOString().slice(0, 10) : "—";
  console.log(`  ${r.alert_level.toUpperCase().padEnd(8)} ${p.name.slice(0, 36).padEnd(37)} u=${String(units).padStart(5)} ddr=${r.daily_demand_rate.toFixed(2).padStart(6)} dsr=${dsr.padStart(6)} reorder=${ro} (${r.reorder_horizon_days < 0 ? Math.round(r.reorder_horizon_days) + "d OVERDUE" : "in " + Math.round(r.reorder_horizon_days) + "d"}) spike=${r.spike_pct.toFixed(0)}%`);
}
console.log(`\n  tier distribution: ok=${tally.ok} yellow=${tally.yellow} red=${tally.red} critical=${tally.critical}  (n=${rows.length})`);

// ── UPSERT SQL (run via Supabase MCP) ────────────────────────────────────────
const sqlVal = (n: number, dp: number) => n.toFixed(dp);
const ids = rows.map((x) => `'${x.p.id}'`).join(", ");
const values = rows.map(({ p, r }) => {
  const dsr = Number.isFinite(r.days_of_stock_remaining) ? sqlVal(r.days_of_stock_remaining, 2) : "NULL";
  const reorder = r.reorder_date ? `'${r.reorder_date.toISOString().slice(0, 10)}'` : "NULL";
  return `  ('${p.id}', ${sqlVal(r.daily_demand_rate, 4)}, ${dsr}, ${reorder}, ${sqlVal(r.spike_pct, 2)}, '${r.alert_level}', now())`;
}).join(",\n");

console.log("\n=== SQL (idempotent: delete + insert one projection per active SKU) ===");
console.log(`begin;
delete from public.projections where product_id in (${ids});
insert into public.projections
  (product_id, daily_demand_rate, days_of_stock_remaining, reorder_date, spike_pct, alert_level, calculated_at)
values
${values};
commit;`);
