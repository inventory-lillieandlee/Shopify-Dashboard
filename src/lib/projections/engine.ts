// Phase A — Projection Engine (pure math, no DB calls).
// Formulas: roadmap §2. Thresholds: derived from lead time + safety (§3, NOT
// global 150/90/45). Every function here is deterministic and unit-tested.

export type AlertLevel = "ok" | "yellow" | "red" | "critical";

export interface ProjectionConfig {
  /** Monthly growth multiplier (roadmap §2: 1.08 = 8% MoM). */
  growth: number;
  /** spike% at or above this ⇒ critical (§3: 15). */
  spikeAlertPct: number;
  /** STUB flag: compound the growth over N periods instead of flat. Default off. */
  compounding: boolean;
  /** yellow DSR cutoff = R + round(yellowLeadFactor * lead). 0.22 reproduces the roadmap's 150/90. */
  yellowLeadFactor: number;
  /** red DSR cutoff = R + round(redLeadFactor * lead). */
  redLeadFactor: number;
}

export const DEFAULT_CONFIG: ProjectionConfig = {
  growth: 1.08,
  spikeAlertPct: 15,
  compounding: false,
  yellowLeadFactor: 0.22,
  redLeadFactor: 0.1,
};

/** DSR sentinel when there is no demand (ddr ≤ 0): infinite stock ⇒ no stockout risk. */
export const NO_DEMAND_DSR = Number.POSITIVE_INFINITY;

// ── 1. Daily Demand Rate (§2.1) ──────────────────────────────────────────────
// DDR = (base_daily_demand * growth) + (upcoming_renewals_30d / 30)
//
// `base_daily_demand` is intentionally ONE named input so the
// past-sales-vs-one-time-sales decision is swappable later WITHOUT touching this
// formula.
// SUBSCRIPTION-OVERLAP TRADEOFF (flagged, NOT resolved — CLAUDE.md decision #1):
//   units_sold_30d already includes subscription orders that renewed, and this
//   formula ADDS upcoming_renewals_30d on top → double-counts demand for
//   high-subscription SKUs. Preferred fix: base the run-rate on ONE-TIME orders
//   + the renewal forecast. Awaiting confirmation.
export function computeDDR(
  input: {
    base_daily_demand: number;
    upcoming_renewals_30d: number;
    growth?: number;
    /** compounding periods (e.g. lead_time_days/30); only used when config.compounding. */
    growth_periods?: number;
  },
  config: ProjectionConfig = DEFAULT_CONFIG,
): number {
  const growth = input.growth ?? config.growth;
  // COMPOUNDING STUB (default flat — CLAUDE.md decision #2, awaiting confirmation):
  // over a 98-day lead time, compounding the 8% MoM is arguably more accurate
  // than applying it flat once. Flag-gated so the math stays swappable.
  const effectiveGrowth = config.compounding
    ? Math.pow(growth, input.growth_periods ?? 1)
    : growth;
  return input.base_daily_demand * effectiveGrowth + input.upcoming_renewals_30d / 30;
}

// ── 2. Days of Stock Remaining (§2.2) ────────────────────────────────────────
// Phase A: current_inventory = shopify_units only (3PL is Phase 3).
export function computeDSR(current_inventory: number, ddr: number): number {
  if (ddr <= 0) return NO_DEMAND_DSR; // no demand ⇒ no risk (sentinel, not a crash)
  return current_inventory / ddr;
}

// ── 3. Reorder Date (§2.3) ───────────────────────────────────────────────────
// reorder_date = today + (dsr - lead - safety) days; negative horizon = overdue.
export function reorderHorizonDays(dsr: number, lead: number, safety: number): number {
  if (!Number.isFinite(dsr)) return Number.POSITIVE_INFINITY; // no demand ⇒ never reorder
  return dsr - lead - safety;
}

function startOfUTCDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function computeReorderDate(
  today: Date,
  dsr: number,
  lead: number,
  safety: number,
): Date | null {
  const horizon = reorderHorizonDays(dsr, lead, safety);
  if (!Number.isFinite(horizon)) return null; // no demand ⇒ no reorder date
  const d = startOfUTCDay(today);
  d.setUTCDate(d.getUTCDate() + Math.round(horizon));
  return d;
}

/** Overdue ⇔ a finite reorder horizon in the past. */
export function isReorderOverdue(dsr: number, lead: number, safety: number): boolean {
  const horizon = reorderHorizonDays(dsr, lead, safety);
  return Number.isFinite(horizon) && horizon < 0;
}

// ── 4. Demand Spike (§2.4) ───────────────────────────────────────────────────
// spike% = ((actual_7d - projected_7d) / projected_7d) * 100; projected_7d = ddr*7
export function projected7d(ddr: number): number {
  return ddr * 7;
}
export function computeSpikePct(actual_7d: number, projected_7d: number): number {
  if (projected_7d <= 0) return 0; // guard: no projected demand ⇒ no meaningful spike
  return ((actual_7d - projected_7d) / projected_7d) * 100;
}

// ── 5. Derived thresholds + classification (§3) ──────────────────────────────
export interface Thresholds {
  critical: number;
  red: number;
  yellow: number;
}

// Per-SKU DSR cutoffs DERIVED from lead + safety (NOT global 150/90/45).
// R = reorder point = lead + safety. yellow = R + round(0.22*lead) reproduces the
// roadmap's 150 (chews) / 90 (cbd); red = R + round(0.10*lead); critical = safety.
export function deriveThresholds(
  lead: number,
  safety: number,
  config: ProjectionConfig = DEFAULT_CONFIG,
): Thresholds {
  const R = lead + safety;
  return {
    critical: safety,
    red: R + Math.round(config.redLeadFactor * lead),
    yellow: R + Math.round(config.yellowLeadFactor * lead),
  };
}

export function classifyAlert(
  dsr: number,
  reorder_overdue: boolean,
  spike_pct: number,
  thresholds: Thresholds,
  config: ProjectionConfig = DEFAULT_CONFIG,
): AlertLevel {
  if (spike_pct >= config.spikeAlertPct) return "critical";
  if (reorder_overdue) return "critical";
  if (dsr <= thresholds.critical) return "critical";
  if (dsr <= thresholds.red) return "red";
  if (dsr <= thresholds.yellow) return "yellow";
  return "ok";
}

// ── Orchestrator (still pure) — used by the recompute routine ────────────────
export interface SkuInput {
  base_daily_demand: number;
  upcoming_renewals_30d: number;
  shopify_units: number;
  lead_time_days: number;
  safety_stock_days: number;
  /** units sold in the last 7 days. Phase A back-derives this (see recompute script). */
  actual_7d: number;
  today: Date;
}

export interface ProjectionResult {
  daily_demand_rate: number;
  days_of_stock_remaining: number; // NO_DEMAND_DSR (Infinity) when ddr ≤ 0
  reorder_date: Date | null;
  reorder_horizon_days: number;
  spike_pct: number;
  alert_level: AlertLevel;
}

export function computeProjection(
  input: SkuInput,
  config: ProjectionConfig = DEFAULT_CONFIG,
): ProjectionResult {
  const ddr = computeDDR(
    { base_daily_demand: input.base_daily_demand, upcoming_renewals_30d: input.upcoming_renewals_30d },
    config,
  );
  const dsr = computeDSR(input.shopify_units, ddr);
  const horizon = reorderHorizonDays(dsr, input.lead_time_days, input.safety_stock_days);
  const reorder_date = computeReorderDate(input.today, dsr, input.lead_time_days, input.safety_stock_days);
  const overdue = Number.isFinite(horizon) && horizon < 0;
  const spike_pct = computeSpikePct(input.actual_7d, projected7d(ddr));
  const thresholds = deriveThresholds(input.lead_time_days, input.safety_stock_days, config);
  const alert_level = classifyAlert(dsr, overdue, spike_pct, thresholds, config);
  return {
    daily_demand_rate: ddr,
    days_of_stock_remaining: dsr,
    reorder_date,
    reorder_horizon_days: horizon,
    spike_pct,
    alert_level,
  };
}
