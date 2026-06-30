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
