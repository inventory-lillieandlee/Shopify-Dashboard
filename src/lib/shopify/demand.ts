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

/**
 * The orders that count as real sales — cancelled and test orders removed. Refunds
 * are NOT filtered here (they're netted per-line inside computeDemand/aggregateSales).
 * Single source of the exclusion rule so the cron and the backfill agree exactly.
 */
export function sellableOrders(orders: ShopifyOrder[]): ShopifyOrder[] {
  return orders.filter((o) => !o.cancelled_at && o.test !== true);
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
  /** the N month keys ("YYYY-MM", in the caller's timeZone), oldest → newest */
  monthKeys: string[];
  /** variant_id -> monthKey -> net units */
  monthly: Map<number, Map<string, number>>;
  /** variant_id -> rolling net totals */
  windows: Map<number, SalesWindows>;
}

/**
 * The calendar month an instant falls in, in the SHOP's local timezone → "YYYY-MM".
 * Shopify `created_at` is an absolute instant; the month a sale belongs to is the
 * shop's local month, not UTC's. e.g. 2026-06-30 23:30 America/Los_Angeles is
 * 2026-07-01 06:30Z — it belongs to June. Intl resolves the offset and DST for the
 * given IANA zone, so nothing is hardcoded. `timeZone` defaults to "UTC" (the old
 * behaviour) so callers that don't care are unaffected.
 */
function monthKeyInTz(d: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit" }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  return `${y}-${m}`;
}

export function aggregateSales(
  orders: ShopifyOrder[],
  now: Date,
  monthsBack = 6,
  timeZone = "UTC",
): SalesAggregate {
  // Build the month keys in the shop's local calendar so "current month" is the shop's
  // current month and the keys line up with monthKeyInTz. Integer month arithmetic
  // avoids Date rollover surprises across year boundaries.
  const [ny, nm] = monthKeyInTz(now, timeZone).split("-").map(Number); // nm: 1-12
  const monthKeys: string[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const t = ny * 12 + (nm - 1) - i;
    monthKeys.push(`${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`);
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
    const od = new Date(order.created_at);
    const t = od.getTime();
    const key = monthKeyInTz(od, timeZone);
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
