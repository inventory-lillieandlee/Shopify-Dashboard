import { test } from "node:test";
import assert from "node:assert/strict";
import {
  levelRank,
  meetsMinLevel,
  parseRecipients,
  isWritableAlertLevel,
  recipientsForLevel,
} from "./policy.ts";

// ── recipient parsing ────────────────────────────────────────────────────────
test("parseRecipients: comma-split + trim", () => {
  assert.deepEqual(parseRecipients("a@x.com, b@y.com ,c@z.com"), [
    "a@x.com",
    "b@y.com",
    "c@z.com",
  ]);
});
test("parseRecipients: single address", () => {
  assert.deepEqual(parseRecipients("ops@lillieandlee.com"), ["ops@lillieandlee.com"]);
});
test("parseRecipients: empty/undefined/blank → [] (no crash)", () => {
  assert.deepEqual(parseRecipients(""), []);
  assert.deepEqual(parseRecipients(undefined), []);
  assert.deepEqual(parseRecipients(null), []);
  assert.deepEqual(parseRecipients(" , ,, "), []);
});

// ── level ordering ───────────────────────────────────────────────────────────
test("levelRank: ok<yellow<red<critical, unknown=-1", () => {
  assert.ok(levelRank("ok") < levelRank("yellow"));
  assert.ok(levelRank("yellow") < levelRank("red"));
  assert.ok(levelRank("red") < levelRank("critical"));
  assert.equal(levelRank("bogus"), -1);
});

// ── min-level filtering (default floor 'red') ────────────────────────────────
test("meetsMinLevel at 'red': yellow excluded, red & critical included, ok never", () => {
  assert.equal(meetsMinLevel("yellow", "red"), false);
  assert.equal(meetsMinLevel("red", "red"), true);
  assert.equal(meetsMinLevel("critical", "red"), true);
  assert.equal(meetsMinLevel("ok", "red"), false);
});
test("meetsMinLevel at 'yellow': yellow+ included, ok still excluded", () => {
  assert.equal(meetsMinLevel("yellow", "yellow"), true);
  assert.equal(meetsMinLevel("critical", "yellow"), true);
  assert.equal(meetsMinLevel("ok", "yellow"), false);
});
test("meetsMinLevel: critical always passes any sane floor", () => {
  for (const min of ["yellow", "red", "critical"]) {
    assert.equal(meetsMinLevel("critical", min), true);
  }
});

// ── alert_log write guard ────────────────────────────────────────────────────
test("isWritableAlertLevel: only yellow/red/critical are insertable", () => {
  assert.equal(isWritableAlertLevel("yellow"), true);
  assert.equal(isWritableAlertLevel("red"), true);
  assert.equal(isWritableAlertLevel("critical"), true);
});
test("isWritableAlertLevel: ok / spike / garbage are rejected (never insert)", () => {
  assert.equal(isWritableAlertLevel("ok"), false);
  assert.equal(isWritableAlertLevel("spike"), false);
  assert.equal(isWritableAlertLevel(""), false);
  assert.equal(isWritableAlertLevel("Critical"), false); // case-sensitive on purpose
});

// ── recipientsForLevel: DB-backed per-recipient routing ──────────────────────
const RECIPIENTS = [
  { email: "ops@x.com", min_level: "red" },
  { email: "owner@x.com", min_level: "critical" },
  { email: "analyst@x.com", min_level: "yellow" },
];
test("recipientsForLevel: critical reaches everyone", () => {
  assert.deepEqual(recipientsForLevel(RECIPIENTS, "critical").sort(), [
    "analyst@x.com",
    "ops@x.com",
    "owner@x.com",
  ].sort());
});
test("recipientsForLevel: red excludes the critical-only recipient", () => {
  assert.deepEqual(recipientsForLevel(RECIPIENTS, "red").sort(), ["analyst@x.com", "ops@x.com"].sort());
});
test("recipientsForLevel: yellow reaches only the yellow recipient", () => {
  assert.deepEqual(recipientsForLevel(RECIPIENTS, "yellow"), ["analyst@x.com"]);
});
test("recipientsForLevel: ok notifies nobody; empty list → []", () => {
  assert.deepEqual(recipientsForLevel(RECIPIENTS, "ok"), []);
  assert.deepEqual(recipientsForLevel([], "critical"), []);
});
