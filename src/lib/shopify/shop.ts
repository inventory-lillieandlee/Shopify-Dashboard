import { shopifyRest } from "./client";

// The shop's IANA timezone (e.g. "America/Los_Angeles"), read from the Shopify shop
// resource. Used to bucket sales into the shop's local calendar month (see
// aggregateSales). We read it live rather than hardcoding an offset so DST and any
// future store relocation are handled by Shopify + Intl, not by us.

/**
 * Fetch the shop's IANA timezone. Falls back to `fallback` (default "UTC") if the field
 * is absent or the call fails — bucketing then degrades to UTC rather than throwing and
 * breaking the whole sync.
 */
export async function fetchShopTimeZone(fallback = "UTC"): Promise<string> {
  try {
    const res = await shopifyRest<{ shop?: { iana_timezone?: string } }>("shop.json?fields=iana_timezone");
    return res.data?.shop?.iana_timezone || fallback;
  } catch {
    return fallback;
  }
}
