import { test } from "node:test";
import assert from "node:assert/strict";
import { computeDemand, clampUnits, aggregateSales } from "./demand.ts";
import type { ShopifyOrder } from "./orders.ts";

const NOW = new Date(Date.UTC(2026, 6, 1, 12, 0, 0));
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

const orders: ShopifyOrder[] = [
  // 2 days ago: 5 of variant 100 (in both windows)
  { id: 1, created_at: daysAgo(2), line_items: [{ id: 11, variant_id: 100, quantity: 5 }], refunds: [] },
  // 10 days ago: 3 of v100 + 2 of v200, refund 1 of v200 (in 30d only, not 7d)
  {
    id: 2,
    created_at: daysAgo(10),
    line_items: [
      { id: 21, variant_id: 100, quantity: 3 },
      { id: 22, variant_id: 200, quantity: 2 },
    ],
    refunds: [{ refund_line_items: [{ line_item_id: 22, quantity: 1 }] }],
  },
  // 40 days ago: outside the 30d window — ignored entirely
  { id: 3, created_at: daysAgo(40), line_items: [{ id: 31, variant_id: 100, quantity: 99 }], refunds: [] },
  // line item with null variant — skipped
  { id: 4, created_at: daysAgo(1), line_items: [{ id: 41, variant_id: null, quantity: 7 }], refunds: [] },
];

test("computeDemand: 30d sums net of refunds, mapped by variant_id", () => {
  const { units30 } = computeDemand(orders, NOW);
  assert.equal(units30.get(100), 8); // 5 + 3 (40d-ago order excluded)
  assert.equal(units30.get(200), 1); // 2 - 1 refunded
});

test("computeDemand: 7d window excludes the 10-day-old order", () => {
  const { units7 } = computeDemand(orders, NOW);
  assert.equal(units7.get(100), 5); // only the 2-day-old order
  assert.equal(units7.get(200), undefined); // 200 only sold 10 days ago
});

test("computeDemand: 40-day-old order fully excluded; null-variant ignored", () => {
  const { units30 } = computeDemand(orders, NOW);
  assert.notEqual(units30.get(100), 8 + 99); // 40d order not counted
});

test("clampUnits: negatives clamp to 0", () => {
  assert.equal(clampUnits(-3), 0);
  assert.equal(clampUnits(undefined), 0);
  assert.equal(clampUnits(12), 12);
});

test("aggregateSales: rolling windows net refunds at the sale time", () => {
  const { windows } = aggregateSales(orders, NOW);
  const w100 = windows.get(100);
  assert.equal(w100?.d7, 5); // 2-day order
  assert.equal(w100?.d30, 8); // 5 + 3
  assert.equal(w100?.d90, 8 + 99); // includes the 40-day order (in 90d, not 30d)
  const w200 = windows.get(200);
  assert.equal(w200?.d30, 1); // 2 - 1 refunded, netted into the 10-day window
});

test("aggregateSales: monthly buckets by sale month, refund netted to sale month", () => {
  // sale of 10 v300 on 2026-05-15, refund 4 → net 6 in 2026-05, even though "now" is July
  const orders2: ShopifyOrder[] = [
    {
      id: 9,
      created_at: "2026-05-15T00:00:00Z",
      line_items: [{ id: 91, variant_id: 300, quantity: 10 }],
      refunds: [{ refund_line_items: [{ line_item_id: 91, quantity: 4 }] }],
    },
  ];
  const { monthKeys, monthly } = aggregateSales(orders2, NOW);
  assert.equal(monthKeys.length, 6);
  assert.deepEqual(monthKeys, ["2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07"]);
  assert.equal(monthly.get(300)?.get("2026-05"), 6); // 10 - 4, in the SALE month
});
