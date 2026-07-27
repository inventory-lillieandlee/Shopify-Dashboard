import { test } from "node:test";
import assert from "node:assert/strict";
import { lastNMonths, monthLabel, historyStartMonth, longMonthYear, type MonthlySale } from "./sales.ts";

const S: MonthlySale[] = [
  { month: "2026-02", units: 0 },
  { month: "2026-03", units: 0 },
  { month: "2026-04", units: 529 },
  { month: "2026-05", units: 732 },
  { month: "2026-06", units: 1039 },
  { month: "2026-07", units: 103 },
];

test("lastNMonths: returns the last n in ascending order", () => {
  assert.deepEqual(lastNMonths(S, 3).map((x) => x.month), ["2026-05", "2026-06", "2026-07"]);
  assert.deepEqual(lastNMonths(S, 1).map((x) => x.month), ["2026-07"]);
  assert.equal(lastNMonths(S, 6).length, 6);
});

test("lastNMonths: fewer than n → all; n<=0 → empty", () => {
  assert.equal(lastNMonths(S, 12).length, 6);
  assert.deepEqual(lastNMonths(S, 0), []);
});

test("monthLabel: MTD only on the current month", () => {
  assert.equal(monthLabel("2026-06", "2026-07"), "Jun");
  assert.equal(monthLabel("2026-07", "2026-07"), "Jul (MTD)");
});

test("historyStartMonth: global min across SKUs (chronological via string compare)", () => {
  assert.equal(historyStartMonth({ a: S, b: [{ month: "2026-01", units: 3 }] }), "2026-01");
  assert.equal(historyStartMonth({ a: S }), "2026-02");
  assert.equal(historyStartMonth({}), null);
  assert.equal(historyStartMonth({ a: [] }), null);
});

test("longMonthYear: full month + year in UTC", () => {
  assert.equal(longMonthYear("2026-02"), "February 2026");
  assert.equal(longMonthYear("2026-12"), "December 2026");
});
