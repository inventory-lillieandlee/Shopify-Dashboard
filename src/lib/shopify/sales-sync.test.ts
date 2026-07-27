import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregateSales } from "./demand.ts";
import { monthlyRefreshSince, syncMonthlySales, type ProductRef } from "./sales-sync.ts";
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

// A SupabaseClient stub that captures the rows passed to monthly_sales.upsert. The
// allowlist we assert is that syncMonthlySales only ever generates rows for
// aggregate.monthKeys — which, at monthsBack=2 (the cron), is exactly {prev, current}.
function captureUpsert() {
  const state: { rows: Array<{ product_id: string; month: string; units_sold: number }> } = { rows: [] };
  const client = {
    from() {
      return {
        upsert(rows: typeof state.rows) {
          state.rows = rows;
          return Promise.resolve({ error: null });
        },
      };
    },
  } as unknown as Parameters<typeof syncMonthlySales>[0];
  return { state, client };
}

test("allowlist: cron write (monthsBack=2) covers only {prev, current} — never January", async () => {
  // Simulated clock 2026-03-01; the pull window opens 2026-01-29 (now-31d), so late-January
  // orders ARE pulled (they feed the trailing-30d demand slice) — but must NOT be written
  // to monthly_sales.
  const now = new Date("2026-03-01T12:00:00.000Z");
  assert.equal(monthlyRefreshSince(now).toISOString(), "2026-01-29T12:00:00.000Z"); // window opens Jan 29

  const orders: ShopifyOrder[] = [
    order(1, "2026-01-30T10:00:00.000Z", 100), // late January — in the pull, must be excluded from writes
    order(2, "2026-02-10T10:00:00.000Z", 40),
    order(3, "2026-02-25T10:00:00.000Z", 60), // February → full month 100
    order(4, "2026-03-01T06:00:00.000Z", 7), // March → partial current
  ];
  const products: ProductRef[] = [{ id: "p1", shopify_variant_id: 1 }];

  const { state, client } = captureUpsert();
  const res = await syncMonthlySales(client, products, orders, now, 2, "UTC");

  assert.deepEqual(res.monthKeys, ["2026-02", "2026-03"]); // allowlist = the aggregate's month keys
  assert.deepEqual([...state.rows.map((r) => r.month)].sort(), ["2026-02-01", "2026-03-01"]);
  assert.ok(!state.rows.some((r) => r.month === "2026-01-01"), "January must never be written");
  assert.equal(state.rows.find((r) => r.month === "2026-02-01")!.units_sold, 100); // February complete
  assert.equal(state.rows.find((r) => r.month === "2026-03-01")!.units_sold, 7); // March partial-current
});
