// Shared recompute core. The per-SKU math lives HERE only — both the 6h cron
// route and scripts/recompute-projections.ts call computeSkuProjection so the two
// can never drift. Reads via any Supabase client; persistProjections writes via
// the service-role admin client (server-only).
//
// Demand is REAL: base_daily_demand = units_sold_30d/30, actual_7d = units_sold_7d
// (from sku_demand, written by the daily demand-sync). renewals stays 0 until
// ReCharge is integrated (so no double-count — CLAUDE.md decision #1 is moot).

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeProjection,
  DEFAULT_CONFIG,
  type ProjectionConfig,
  type ProjectionResult,
} from "./engine.ts";

const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));

export interface SkuDemandInput {
  shopify_units: number;
  /** real net units sold in the last 30 days (from sku_demand) */
  units_sold_30d: number;
  /** real net units sold in the last 7 days */
  units_sold_7d: number;
  upcoming_renewals_30d: number;
  lead_time_days: number;
  safety_stock_days: number;
  today: Date;
}

/** THE recompute math (single source) — real demand in, ProjectionResult out. */
export function computeSkuProjection(
  input: SkuDemandInput,
  config: ProjectionConfig = DEFAULT_CONFIG,
): ProjectionResult {
  const base_daily_demand = Math.max(input.units_sold_30d, 0) / 30;
  const actual_7d = Math.max(input.units_sold_7d, 0);
  return computeProjection(
    {
      base_daily_demand,
      upcoming_renewals_30d: input.upcoming_renewals_30d,
      shopify_units: input.shopify_units,
      lead_time_days: input.lead_time_days,
      safety_stock_days: input.safety_stock_days,
      actual_7d,
      today: input.today,
    },
    config,
  );
}

// ── DB I/O for the cron route ────────────────────────────────────────────────

export interface RecomputeProduct {
  id: string;
  name: string;
  category: string;
  lead_time_days: number;
  safety_stock_days: number;
}

export interface RecomputeInputs {
  products: RecomputeProduct[];
  latestSnapUnits: Map<string, number>;
  demand30: Map<string, number>;
  demand7: Map<string, number>;
  renewals30d: Map<string, number>;
}

/** Read everything the recompute needs: latest snapshot, real demand, 30d renewals. */
export async function readRecomputeInputs(
  client: SupabaseClient,
  now: Date,
): Promise<RecomputeInputs> {
  const horizon30 = new Date(now);
  horizon30.setUTCDate(horizon30.getUTCDate() + 30);

  const [products, snaps, demand, renewals] = await Promise.all([
    client
      .from("products")
      .select("id, name, category, lead_time_days, safety_stock_days")
      .eq("active", true)
      .order("name"),
    client
      .from("inventory_snapshots")
      .select("product_id, shopify_units, snapshot_at")
      .order("snapshot_at", { ascending: false }),
    client.from("sku_demand").select("product_id, units_sold_30d, units_sold_7d"),
    client.from("recharge_renewals").select("product_id, expected_units, renewal_date"),
  ]);
  if (products.error) throw new Error(`products: ${products.error.message}`);
  if (snaps.error) throw new Error(`inventory_snapshots: ${snaps.error.message}`);
  if (demand.error) throw new Error(`sku_demand: ${demand.error.message}`);
  if (renewals.error) throw new Error(`recharge_renewals: ${renewals.error.message}`);

  const latestSnapUnits = new Map<string, number>();
  for (const s of snaps.data ?? []) {
    if (!latestSnapUnits.has(s.product_id)) latestSnapUnits.set(s.product_id, num(s.shopify_units));
  }

  const demand30 = new Map<string, number>();
  const demand7 = new Map<string, number>();
  for (const d of demand.data ?? []) {
    demand30.set(d.product_id, num(d.units_sold_30d));
    demand7.set(d.product_id, num(d.units_sold_7d));
  }

  const renewals30d = new Map<string, number>();
  for (const r of renewals.data ?? []) {
    const d = new Date(r.renewal_date);
    if (d >= now && d <= horizon30) {
      renewals30d.set(r.product_id, (renewals30d.get(r.product_id) ?? 0) + num(r.expected_units));
    }
  }

  return {
    products: (products.data ?? []) as RecomputeProduct[],
    latestSnapUnits,
    demand30,
    demand7,
    renewals30d,
  };
}

export interface ComputedProjection {
  product_id: string;
  result: ProjectionResult;
}

/** Compute one projection per active SKU that has an inventory snapshot. */
export function computeAll(inputs: RecomputeInputs, today: Date): ComputedProjection[] {
  const out: ComputedProjection[] = [];
  for (const p of inputs.products) {
    if (!inputs.latestSnapUnits.has(p.id)) continue; // no inventory snapshot → skip
    const result = computeSkuProjection({
      shopify_units: inputs.latestSnapUnits.get(p.id) ?? 0,
      units_sold_30d: inputs.demand30.get(p.id) ?? 0,
      units_sold_7d: inputs.demand7.get(p.id) ?? 0,
      upcoming_renewals_30d: inputs.renewals30d.get(p.id) ?? 0,
      lead_time_days: p.lead_time_days,
      safety_stock_days: p.safety_stock_days,
      today,
    });
    out.push({ product_id: p.id, result });
  }
  return out;
}

/**
 * Idempotent persist via the SERVICE-ROLE client (server-only): delete the
 * projection rows for these SKUs, then insert the fresh ones. Returns rows written.
 */
export async function persistProjections(
  admin: SupabaseClient,
  rows: ComputedProjection[],
  now: Date,
): Promise<number> {
  if (rows.length === 0) return 0;
  const ids = rows.map((r) => r.product_id);
  const del = await admin.from("projections").delete().in("product_id", ids);
  if (del.error) throw new Error(`projections delete: ${del.error.message}`);

  const payload = rows.map((r) => ({
    product_id: r.product_id,
    daily_demand_rate: round(r.result.daily_demand_rate, 4),
    days_of_stock_remaining: Number.isFinite(r.result.days_of_stock_remaining)
      ? round(r.result.days_of_stock_remaining, 2)
      : null,
    reorder_date: r.result.reorder_date ? r.result.reorder_date.toISOString().slice(0, 10) : null,
    spike_pct: round(r.result.spike_pct, 2),
    alert_level: r.result.alert_level,
    calculated_at: now.toISOString(),
  }));
  const ins = await admin.from("projections").insert(payload);
  if (ins.error) throw new Error(`projections insert: ${ins.error.message}`);
  return payload.length;
}

function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
