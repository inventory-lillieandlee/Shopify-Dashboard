import { test } from "node:test";
import assert from "node:assert/strict";
import { lastNMonths, monthLabel, type MonthlySale } from "./sales.ts";

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
