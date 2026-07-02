import { shopifyGraphQL, SHOPIFY_LOCATION_ID } from "./client";

export interface InventoryLevel {
  /** Sellable = on_hand − committed − reserved. Matches the Shopify admin's default
   *  "Available" column and is the number the dashboard displays. */
  available: number | null;
  /** Physical count, kept for reference. */
  onHand: number | null;
  /** Units on unfulfilled orders, kept for reference. */
  committed: number | null;
}

interface InvNode {
  id: string;
  inventoryLevel: { quantities: { name: string; quantity: number }[] } | null;
}

/**
 * Fresh inventory levels per inventory_item_id at the Shop location, via GraphQL
 * (one call). The store is confirmed single-location, so a per-location read at the
 * Shop location IS the store total. Returns `available` (the displayed number) plus
 * on_hand + committed for reference. Missing items are absent from the map.
 */
export async function fetchInventoryLevels(
  inventoryItemIds: (number | string)[],
): Promise<Map<string, InventoryLevel>> {
  if (inventoryItemIds.length === 0) return new Map();
  const ids = inventoryItemIds.map((i) => `"gid://shopify/InventoryItem/${i}"`).join(",");
  const query =
    `{ nodes(ids:[${ids}]){ ... on InventoryItem { id ` +
    `inventoryLevel(locationId:"gid://shopify/Location/${SHOPIFY_LOCATION_ID}"){ ` +
    `quantities(names:["available","on_hand","committed"]){ name quantity } } } } }`;
  const data = await shopifyGraphQL<{ nodes: (InvNode | null)[] }>(query);
  const out = new Map<string, InventoryLevel>();
  for (const node of data.nodes ?? []) {
    if (!node) continue;
    const iii = node.id.split("/").pop();
    if (!iii) continue;
    const qs = node.inventoryLevel?.quantities ?? [];
    const q = (name: string) => qs.find((x) => x.name === name)?.quantity ?? null;
    out.set(iii, { available: q("available"), onHand: q("on_hand"), committed: q("committed") });
  }
  return out;
}
