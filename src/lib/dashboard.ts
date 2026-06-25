// Pure, framework-free view helpers derived from InventoryRow[].
// No Supabase / no React here — easy to unit-test and reuse.

import type { AlertLevel, Category, InventoryRow } from "./data/types.ts";
import { deriveThresholds } from "./projections/engine.ts";

export const CATEGORY_LABELS: Record<Category, string> = {
  supplement_chews: "Supplement Chews",
  cbd: "CBD",
  treats: "Treats",
  salmon_oil: "Salmon Oil",
};

export const ALERT_LABELS: Record<AlertLevel, string> = {
  ok: "OK",
  yellow: "Yellow",
  red: "Red",
  critical: "Critical",
};

// Most-severe first — used for the "worst first" default ordering & summaries.
export const ALERT_SEVERITY: Record<AlertLevel, number> = {
  critical: 0,
  red: 1,
  yellow: 2,
  ok: 3,
};

export const SPIKE_ALERT_THRESHOLD = 15; // §3: spike >= 15% => critical
export const SPIKE_DISPLAY_THRESHOLD = 10; // §3.1: show spike if >= 10%
export const REORDER_QUEUE_HORIZON_DAYS = 14;

export interface Summary {
  totalSkus: number;
  yellow: number;
  red: number;
  critical: number;
  spiking: number;
}

export function deriveSummary(rows: InventoryRow[]): Summary {
  return {
    totalSkus: rows.length,
    yellow: rows.filter((r) => r.alertLevel === "yellow").length,
    red: rows.filter((r) => r.alertLevel === "red").length,
    critical: rows.filter((r) => r.alertLevel === "critical").length,
    spiking: rows.filter((r) => (r.spikePct ?? 0) >= SPIKE_ALERT_THRESHOLD).length,
  };
}

/** Whole days from today to an ISO date (negative = in the past). */
export function daysUntil(dateIso: string | null): number | null {
  if (!dateIso) return null;
  const target = new Date(dateIso.length <= 10 ? `${dateIso}T00:00:00` : dateIso);
  const now = new Date();
  const a = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate());
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((a - b) / 86_400_000);
}

export function isOverdue(reorderDate: string | null): boolean {
  const d = daysUntil(reorderDate);
  return d !== null && d < 0;
}

/**
 * Reorder queue: SKUs whose reorder date is overdue or within the horizon,
 * sorted by urgency: most overdue / soonest first, then by alert severity, then
 * by lowest days-of-stock — so equally-dated items still rank by how bad they are.
 */
export function reorderQueue(rows: InventoryRow[]): InventoryRow[] {
  return rows
    .filter((r) => {
      const d = daysUntil(r.reorderDate);
      return d !== null && d <= REORDER_QUEUE_HORIZON_DAYS;
    })
    .sort((a, b) => {
      const da = daysUntil(a.reorderDate) ?? 0;
      const db = daysUntil(b.reorderDate) ?? 0;
      if (da !== db) return da - db; // most overdue / soonest reorder date first
      const sa = ALERT_SEVERITY[a.alertLevel ?? "ok"];
      const sb = ALERT_SEVERITY[b.alertLevel ?? "ok"];
      if (sa !== sb) return sa - sb; // then most severe alert first
      return (
        (a.daysOfStockRemaining ?? Number.POSITIVE_INFINITY) -
        (b.daysOfStockRemaining ?? Number.POSITIVE_INFINITY)
      ); // then lowest days of stock first
    });
}

// ── Alert reasons (the "why") ────────────────────────────────────────────────
// DERIVED from fields the row already carries (no seam / contract / engine
// edits) — thresholds come from the engine's deriveThresholds() so the band
// logic keeps a single source of truth.

export type AlertReasonKind = "overdue" | "low_stock" | "spike";

export interface AlertReason {
  kind: AlertReasonKind;
  /** Human label, e.g. "reorder overdue", "critically low stock", "demand spike". */
  label: string;
}

/**
 * Why a SKU sits at its alert level. Anchored to the STORED `alertLevel` so a
 * reason can never contradict the badge:
 *   - ok / null  → []
 *   - critical   → every active critical driver, headline-priority order
 *                  (overdue › critically-low › spike). The detail view shows all.
 *   - red        → "low stock"   (spike/overdue always escalate to critical, so
 *   - yellow     → "stock getting low"   red/yellow are low-stock-driven)
 */
export function alertReasons(row: InventoryRow): AlertReason[] {
  const level = row.alertLevel;
  if (!level || level === "ok") return [];
  if (level === "red") return [{ kind: "low_stock", label: "low stock" }];
  if (level === "yellow") return [{ kind: "low_stock", label: "stock getting low" }];

  // critical: collect every active driver, most-actionable first.
  const reasons: AlertReason[] = [];
  if (isOverdue(row.reorderDate)) {
    reasons.push({ kind: "overdue", label: "reorder overdue" });
  }
  const { critical } = deriveThresholds(row.leadTimeDays, row.safetyStockDays);
  if (row.daysOfStockRemaining !== null && row.daysOfStockRemaining <= critical) {
    reasons.push({ kind: "low_stock", label: "critically low stock" });
  }
  if ((row.spikePct ?? 0) >= SPIKE_ALERT_THRESHOLD) {
    reasons.push({ kind: "spike", label: "demand spike" });
  }

  if (reasons.length === 0) {
    // A critical badge with NO derivable driver means the engine's classification
    // and the UI's threshold derivation disagree (drift). Keep the UI sane, but
    // make the contradiction loud in dev — silent in the UI, visible in logs.
    console.warn(
      `alert reason fallback: critical/red SKU ${row.shopifyProductId} (${row.name}) ` +
        `had no derivable driver — engine/UI threshold drift?`,
    );
    return [{ kind: "low_stock", label: "low stock" }];
  }
  return reasons;
}

/** The single headline driver (first by priority), or null when not alerting. */
export function primaryAlertReason(row: InventoryRow): AlertReason | null {
  return alertReasons(row)[0] ?? null;
}

export type SortKey = "dsr" | "name" | "units";
export type SortDir = "asc" | "desc";

export function sortRows(rows: InventoryRow[], key: SortKey, dir: SortDir): InventoryRow[] {
  const factor = dir === "asc" ? 1 : -1;
  const val = (r: InventoryRow): number | string => {
    if (key === "name") return r.name.toLowerCase();
    if (key === "units") return r.currentUnits ?? -1;
    return r.daysOfStockRemaining ?? Number.POSITIVE_INFINITY; // dsr
  };
  return [...rows].sort((a, b) => {
    const va = val(a);
    const vb = val(b);
    if (va < vb) return -1 * factor;
    if (va > vb) return 1 * factor;
    return 0;
  });
}
