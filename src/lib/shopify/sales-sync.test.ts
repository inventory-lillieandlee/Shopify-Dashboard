import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregateSales } from "./demand.ts";
import { monthlyRefreshSince } from "./sales-sync.ts";
import type { ShopifyOrder } from "./orders.ts";

// Task 3 — month-boundary regression. With a simulated clock of 2026-08-03, the monthly
// refresh must store July's FULL total, not just the tail the naive now-30d window would
// reach. Models the cron faithfully: fetch orders with created_at >= since, then aggregate
// — the ONLY difference between the two runs is `since`.

function order(id: number, created_at: string, qty: number): ShopifyOrder {
  return { id, created_at, line_items: [{ id: id * 100, variant_id: 1, quantity: qty }], refunds: [] };
}

test("month-boundary: Task 2 window captures all of July; naive now-30d undercounts it", () => {
  const now = new Date("2026-08-03T12:00:00.000Z"); // simulated clock, 3 days into August
  const V = 1;
  const orders: ShopifyOrder[] = [
    order(1, "2026-07-01T09:00:00.000Z", 10), // ┐ early July — BEFORE now-30d (Jul 4 12:00),
    order(2, "2026-07-02T09:00:00.000Z", 5),  // │ so a naive now-30d pull never fetches these
    order(3, "2026-07-03T06:00:00.000Z", 8),  // ┘ (23 units)
    order(4, "2026-07-15T09:00:00.000Z", 20),
    order(5, "2026-07-31T20:00:00.000Z", 12),
    order(6, "2026-08-01T09:00:00.000Z", 7),  // current month — present in both windows
    order(7, "2026-08-02T09:00:00.000Z", 3),
  ];
  const FULL_JULY = 10 + 5 + 8 + 20 + 12; // 55 — the true full-month total
  const EARLY_JULY = 10 + 5 + 8; // 23 — dropped by the naive window

  // A window = the cron's fetch: every order created on/after `since`, then aggregated.
  const julyUnitsWith = (since: Date) =>
    aggregateSales(
      orders.filter((o) => new Date(o.created_at).getTime() >= since.getTime()),
      now,
      2, // prev + current month → monthKeys ["2026-07","2026-08"]
    ).monthly.get(V)?.get("2026-07") ?? 0;

  // Task 2 window (the real, shared formula) starts at the first instant of the prev month.
  const taskSince = monthlyRefreshSince(now);
  assert.equal(taskSince.toISOString(), "2026-07-01T00:00:00.000Z");
  const taskJuly = julyUnitsWith(taskSince);

  // Naive window — the bug this guards against.
  const naiveSince = new Date(now.getTime() - 30 * 86_400_000);
  assert.equal(naiveSince.toISOString(), "2026-07-04T12:00:00.000Z");
  const naiveJuly = julyUnitsWith(naiveSince);

  // PASS on the Task 2 window: July stored as the full month.
  assert.equal(taskJuly, FULL_JULY, "Task 2 window must store the full July total");

  // FAIL on the naive window: it undercounts July by exactly the early-July units it
  // never fetched. This is the proof the naive now-30d window is wrong at the boundary.
  assert.equal(naiveJuly, FULL_JULY - EARLY_JULY); // 32, i.e. only Jul 4–31
  assert.throws(
    () => assert.equal(naiveJuly, FULL_JULY),
    "the naive now-30d window fails the full-month assertion that the Task 2 window passes",
  );
});
