import { shopifyRest, shopifyRestUrl } from "./client";

// Slim order shapes — only the fields the demand calc needs.
export interface OrderLineItem {
  id: number;
  variant_id: number | null;
  quantity: number;
}
export interface OrderRefundLineItem {
  line_item_id: number;
  quantity: number;
}
export interface OrderRefund {
  refund_line_items: OrderRefundLineItem[];
}
export interface ShopifyOrder {
  id: number;
  created_at: string;
  /** Set when the order was cancelled (null otherwise). Only populated when requested
   *  in `fields` — the demand-sync default omits it; the backfill script requests it. */
  cancelled_at?: string | null;
  line_items: OrderLineItem[];
  refunds: OrderRefund[];
}

function parseNextLink(link: string | null): string | null {
  if (!link) return null;
  for (const part of link.split(",")) {
    const m = part.match(/<([^>]+)>;\s*rel="next"/);
    if (m) return m[1];
  }
  return null;
}

/**
 * Pull every order created since `sinceIso` via cursor pagination (slim fields).
 * `status=any` includes open/closed/cancelled; the demand calc nets refunds.
 * `fields` defaults to the demand-sync set; the 6-month backfill passes a wider set
 * (adds cancelled_at) — orders >60 days old require the read_all_orders scope.
 */
export async function fetchOrdersSince(
  sinceIso: string,
  maxPages = 200,
  fields = "id,created_at,line_items,refunds",
): Promise<ShopifyOrder[]> {
  const firstPath =
    `orders.json?status=any&limit=250&created_at_min=${encodeURIComponent(sinceIso)}` +
    `&fields=${encodeURIComponent(fields)}`;
  const out: ShopifyOrder[] = [];
  let res = await shopifyRest<{ orders: ShopifyOrder[] }>(firstPath);
  let pages = 0;
  for (;;) {
    if (res.status !== 200) throw new Error(`orders pull HTTP ${res.status}`);
    out.push(...(res.data?.orders ?? []));
    pages += 1;
    const next = parseNextLink(res.link);
    if (!next || pages >= maxPages) break;
    res = await shopifyRestUrl<{ orders: ShopifyOrder[] }>(next);
  }
  return out;
}
