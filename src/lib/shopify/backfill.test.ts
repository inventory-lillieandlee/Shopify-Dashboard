import { test } from "node:test";
import assert from "node:assert/strict";
import { monthIndex, monthKeyFromIndex, backfillMonths, advanceCursor, DEMAND_STEP, shopMonth } from "./backfill.ts";

test("monthIndex/monthKeyFromIndex round-trip incl. year rollover", () => {
  assert.equal(monthKeyFromIndex(monthIndex("2026-03")), "2026-03");
  assert.equal(monthKeyFromIndex(monthIndex("2026-12") + 1), "2027-01");
  assert.equal(monthKeyFromIndex(monthIndex("2026-01") - 1), "2025-12");
});

test("backfillMonths: inclusive floor..target; empty when floor > target", () => {
  assert.deepEqual(backfillMonths("2026-03", "2026-07"), ["2026-03", "2026-04", "2026-05", "2026-06", "2026-07"]);
  assert.deepEqual(backfillMonths("2026-07", "2026-07"), ["2026-07"]);
  assert.deepEqual(backfillMonths("2026-08", "2026-07"), []);
});

test("advanceCursor: next month, then DEMAND_STEP once past target", () => {
  assert.equal(advanceCursor("2026-03", "2026-07"), "2026-04");
  assert.equal(advanceCursor("2026-06", "2026-07"), "2026-07");
  assert.equal(advanceCursor("2026-07", "2026-07"), DEMAND_STEP);
  assert.equal(advanceCursor("2026-12", "2027-01"), "2027-01"); // cross-year
});

test("shopMonth: shop-local month key (tz-aware)", () => {
  // 2026-07-01T06:30Z == 2026-06-30 23:30 America/Los_Angeles → June locally, July in UTC.
  assert.equal(shopMonth(new Date("2026-07-01T06:30:00Z"), "America/Los_Angeles"), "2026-06");
  assert.equal(shopMonth(new Date("2026-07-01T06:30:00Z"), "UTC"), "2026-07");
});
