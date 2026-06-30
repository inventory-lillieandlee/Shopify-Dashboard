import { shopifyGraphQL, SHOPIFY_LOCATION_ID } from "./client";

interface InvNode {
  id: string;
  inventoryLevel: { quantities: { name: string; quantity: number }[] } | null;
}

/**
 * Fresh on_hand per inventory_item_id at the Shop location, via GraphQL (one call).
 * Returns a map keyed by inventory_item_id (string). Missing items are absent.
 */
export async function fetchOnHand(inventoryItemIds: (number | string)[]): Promise<Map<string, number>> {
  if (inventoryItemIds.length === 0) return new Map();
  const ids = inventoryItemIds.map((i) => `"gid://shopify/InventoryItem/${i}"`).join(",");
  const query =
    `{ nodes(ids:[${ids}]){ ... on InventoryItem { id ` +
    `inventoryLevel(locationId:"gid://shopify/Location/${SHOPIFY_LOCATION_ID}"){ ` +
    `quantities(names:["on_hand"]){ name quantity } } } } }`;
  const data = await shopifyGraphQL<{ nodes: (InvNode | null)[] }>(query);
  const out = new Map<string, number>();
  for (const node of data.nodes ?? []) {
    if (!node) continue;
    const iii = node.id.split("/").pop();
    const onHand = node.inventoryLevel?.quantities?.find((q) => q.name === "on_hand")?.quantity;
    if (iii && onHand !== undefined) out.set(iii, onHand);
  }
  return out;
}
