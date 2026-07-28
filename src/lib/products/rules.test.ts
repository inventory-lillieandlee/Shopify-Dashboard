import { test } from "node:test";
import assert from "node:assert/strict";
import { isTrackableCategory, isMultiVariant, resolveAutoActivate, backfillShouldFail } from "./rules.ts";

test("isTrackableCategory: the 4 known categories only; never inferred", () => {
  for (const c of ["supplement_chews", "cbd", "treats", "salmon_oil"]) assert.equal(isTrackableCategory(c), true);
  for (const c of ["", "apparel", "CBD", "widgets", "supplement"]) assert.equal(isTrackableCategory(c), false);
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
