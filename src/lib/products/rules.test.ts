import { test } from "node:test";
import assert from "node:assert/strict";
import { isTrackableCategory, isMultiVariant, resolveAutoActivate, backfillShouldFail, availableFromCatalog, monthlySalesIsCurrent, type CatalogRow } from "./rules.ts";

test("isTrackableCategory: the known categories only; never inferred", () => {
  for (const c of ["supplement_chews", "cbd", "treats", "salmon_oil", "human_supplement"]) assert.equal(isTrackableCategory(c), true);
  for (const c of ["", "apparel", "CBD", "widgets", "supplement", "human"]) assert.equal(isTrackableCategory(c), false);
});

test("isMultiVariant: >1 variant is rejected", () => {
  assert.equal(isMultiVariant(1), false);
  assert.equal(isMultiVariant(2), true);
  assert.equal(isMultiVariant(6), true);
  assert.equal(isMultiVariant(0), false); // defensive
});

test("resolveAutoActivate: defaults true; only explicit false opts out", () => {
  assert.equal(resolveAutoActivate(undefined), true);
  assert.equal(resolveAutoActivate(true), true);
  assert.equal(resolveAutoActivate(false), false);
  assert.equal(resolveAutoActivate(null), false); // non-true → not activated
  assert.equal(resolveAutoActivate("true"), false); // strict boolean only
});

test("backfillShouldFail: permanent OR attempts>3", () => {
  assert.equal(backfillShouldFail(true, 1), true); // permanent → immediate
  assert.equal(backfillShouldFail(false, 1), false);
  assert.equal(backfillShouldFail(false, 3), false); // 3 is not yet over the limit
  assert.equal(backfillShouldFail(false, 4), true); // 4th consecutive transient → fail
});

test("availableFromCatalog: excludes ONLY active, offers removed (flagged), disables multi-variant, sorts", () => {
  const rows: CatalogRow[] = [
    { variant_id: 1, shopify_product_id: 10, title: "Zebra Chews", sku: "Z", variant_title: null, status: "active", variant_count: 1 },
    { variant_id: 2, shopify_product_id: 20, title: "Apple Oil", sku: "A", variant_title: null, status: "active", variant_count: 1 },
    { variant_id: 3, shopify_product_id: 30, title: "Merch Tee", sku: "M", variant_title: null, status: "active", variant_count: 6 },
    { variant_id: 4, shopify_product_id: 40, title: "Active Tracked", sku: "T", variant_title: null, status: "active", variant_count: 1 },
    { variant_id: 5, shopify_product_id: 50, title: "Removed Salmon Oil", sku: "R", variant_title: null, status: "active", variant_count: 1 },
  ];
  // variant 4 active (tracked → hidden); variant 5 inactive (removed → offered, flagged).
  const out = availableFromCatalog(rows, new Set([4]), new Set([5]));
  assert.deepEqual(out.map((o) => o.title), ["Apple Oil", "Merch Tee", "Removed Salmon Oil", "Zebra Chews"]); // active-tracked gone; removed present
  assert.equal(out.find((o) => o.variant_id === 4), undefined); // active excluded
  const removed = out.find((o) => o.variant_id === 5)!;
  assert.equal(removed.previouslyRemoved, true);
  assert.equal(removed.selectable, true); // removed single-variant SKU stays selectable → re-add path
  assert.equal(out.find((o) => o.variant_id === 2)!.previouslyRemoved, false); // never-tracked
  const multi = out.find((o) => o.variant_id === 3)!;
  assert.equal(multi.selectable, false);
  assert.match(multi.reason!, /6 variants/);
});

test("monthlySalesIsCurrent: reuse only when newest month is current or previous", () => {
  // now = 2026-07 → previous = 2026-06
  assert.equal(monthlySalesIsCurrent("2026-07", "2026-06"), true); // current month
  assert.equal(monthlySalesIsCurrent("2026-06", "2026-06"), true); // previous month (boundary)
  assert.equal(monthlySalesIsCurrent("2026-05", "2026-06"), false); // two months stale → re-enqueue
  assert.equal(monthlySalesIsCurrent("2025-12", "2026-06"), false); // year prior
  assert.equal(monthlySalesIsCurrent(null, "2026-06"), false); // no retained history → full backfill
});
