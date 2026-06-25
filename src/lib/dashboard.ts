// Pure, framework-free view helpers derived from InventoryRow[].
// No Supabase / no React here — easy to unit-test and reuse.

import type { AlertLevel, Category, InventoryRow } from "./data/types";

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
 * sorted by urgency (most overdue / soonest first).
 */
export function reorderQueue(rows: InventoryRow[]): InventoryRow[] {
  return rows
    .filter((r) => {
      const d = daysUntil(r.reorderDate);
      return d !== null && d <= REORDER_QUEUE_HORIZON_DAYS;
    })
    .sort((a, b) => (daysUntil(a.reorderDate) ?? 0) - (daysUntil(b.reorderDate) ?? 0));
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
