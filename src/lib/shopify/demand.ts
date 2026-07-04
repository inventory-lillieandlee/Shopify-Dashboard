import type { ShopifyOrder } from "./orders";

// Pure demand aggregation — no I/O, unit-tested. Sums units sold per variant_id
// over 30-day and 7-day windows, NET of refunds. Refunds are netted within the
// order's window (their line items map back to the order's variant via line_item_id).

export interface DemandResult {
  /** variant_id -> net units sold in the last 30 days */
  units30: Map<number, number>;
  /** variant_id -> net units sold in the last 7 days */
  units7: Map<number, number>;
}

function add(m: Map<number, number>, key: number, n: number) {
  m.set(key, (m.get(key) ?? 0) + n);
}

export function computeDemand(orders: ShopifyOrder[], now: Date): DemandResult {
  const cut30 = now.getTime() - 30 * 86_400_000;
  const cut7 = now.getTime() - 7 * 86_400_000;
  const units30 = new Map<number, number>();
  const units7 = new Map<number, number>();

  for (const order of orders) {
    const t = new Date(order.created_at).getTime();
    if (t < cut30) continue;
    const in7 = t >= cut7;

    // Map this order's line_item id -> variant_id so refund line items can net back.
    const lineItemVariant = new Map<number, number>();
    for (const li of order.line_items) {
      if (li.variant_id == null) continue;
      lineItemVariant.set(li.id, li.variant_id);
      add(units30, li.variant_id, li.quantity);
      if (in7) add(units7, li.variant_id, li.quantity);
    }
    for (const refund of order.refunds ?? []) {
      for (const rli of refund.refund_line_items ?? []) {
        const variant = lineItemVariant.get(rli.line_item_id);
        if (variant == null) continue;
        add(units30, variant, -rli.quantity);
        if (in7) add(units7, variant, -rli.quantity);
      }
    }
  }
  return { units30, units7 };
}

/** Net demand can't be negative for a rate — clamp at 0. */
export function clampUnits(n: number | undefined): number {
  return Math.max(n ?? 0, 0);
}

// ── 6-month aggregation for the backfill (pure, extends the 30d/7d model) ──────
// Per variant_id: units per calendar month (last N months) + rolling 7/30/60/90-day
// totals, all NET of refunds. CONVENTION: a refund is netted against the SALE's month
// and window (the order's created_at), i.e. we measure true consumption at the time
// of sale, not when the money was returned. Cancellation handling is deliberately NOT
// here — the caller decides (see backfill script) so this stays a clean sales roll-up.

export interface SalesWindows {
  d7: number;
  d30: number;
  d60: number;
  d90: number;
}

export interface SalesAggregate {
  /** the N month keys ("YYYY-MM", UTC), oldest → newest */
  monthKeys: string[];
  /** variant_id -> monthKey -> net units */
  monthly: Map<number, Map<string, number>>;
  /** variant_id -> rolling net totals */
  windows: Map<number, SalesWindows>;
}

function monthKeyOf(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function aggregateSales(orders: ShopifyOrder[], now: Date, monthsBack = 6): SalesAggregate {
  const monthKeys: string[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    monthKeys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  const monthSet = new Set(monthKeys);
  const cut7 = now.getTime() - 7 * 86_400_000;
  const cut30 = now.getTime() - 30 * 86_400_000;
  const cut60 = now.getTime() - 60 * 86_400_000;
  const cut90 = now.getTime() - 90 * 86_400_000;

  const monthly = new Map<number, Map<string, number>>();
  const windows = new Map<number, SalesWindows>();
  const addMonth = (v: number, key: string, n: number) => {
    let m = monthly.get(v);
    if (!m) monthly.set(v, (m = new Map()));
    m.set(key, (m.get(key) ?? 0) + n);
  };
  const addWin = (v: number, t: number, n: number) => {
    let w = windows.get(v);
    if (!w) windows.set(v, (w = { d7: 0, d30: 0, d60: 0, d90: 0 }));
    if (t >= cut90) w.d90 += n;
    if (t >= cut60) w.d60 += n;
    if (t >= cut30) w.d30 += n;
    if (t >= cut7) w.d7 += n;
  };

  for (const order of orders) {
    const t = new Date(order.created_at).getTime();
    const key = monthKeyOf(order.created_at);
    const inMonth = monthSet.has(key);
    const lineItemVariant = new Map<number, number>();
    for (const li of order.line_items) {
      if (li.variant_id == null) continue;
      lineItemVariant.set(li.id, li.variant_id);
      if (inMonth) addMonth(li.variant_id, key, li.quantity);
      addWin(li.variant_id, t, li.quantity);
    }
    // Net refunds against the SALE's month + window (true-consumption timing).
    for (const refund of order.refunds ?? []) {
      for (const rli of refund.refund_line_items ?? []) {
        const v = lineItemVariant.get(rli.line_item_id);
        if (v == null) continue;
        if (inMonth) addMonth(v, key, -rli.quantity);
        addWin(v, t, -rli.quantity);
      }
    }
  }
  return { monthKeys, monthly, windows };
}
