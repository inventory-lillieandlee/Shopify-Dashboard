import { test } from "node:test";
import assert from "node:assert/strict";
import { alertReasons, primaryAlertReason } from "./dashboard.ts";
import type { InventoryRow } from "./data/types.ts";

// A healthy chews row (thresholds {critical:30, red:138, yellow:150}); override per case.
function row(over: Partial<InventoryRow>): InventoryRow {
  return {
    productId: "p",
    shopifyProductId: "123",
    name: "Test SKU",
    category: "supplement_chews",
    leadTimeDays: 98,
    safetyStockDays: 30,
    currentUnits: 1000,
    totalUnits: 1000,
    lastUpdated: null,
    dailyDemandRate: 5,
    daysOfStockRemaining: 300,
    reorderDate: "2999-01-01", // far future ⇒ not overdue
    spikePct: 0,
    alertLevel: "ok",
    ...over,
  };
}

const PAST = "2020-01-01"; // clearly overdue regardless of "today"

// ── non-alerting ─────────────────────────────────────────────────────────────
test("alertReasons: ok → []", () => {
  assert.deepEqual(alertReasons(row({ alertLevel: "ok" })), []);
});
test("alertReasons: null level → []", () => {
  assert.deepEqual(alertReasons(row({ alertLevel: null })), []);
});

// ── red / yellow are low-stock-driven ────────────────────────────────────────
test("alertReasons: red → low stock", () => {
  assert.deepEqual(alertReasons(row({ alertLevel: "red", daysOfStockRemaining: 135 })), [
    { kind: "low_stock", label: "low stock" },
  ]);
});
test("alertReasons: yellow → stock getting low", () => {
  assert.deepEqual(alertReasons(row({ alertLevel: "yellow", daysOfStockRemaining: 145 })), [
    { kind: "low_stock", label: "stock getting low" },
  ]);
});

// ── critical, single driver each ─────────────────────────────────────────────
test("alertReasons: critical by overdue only", () => {
  const r = alertReasons(
    row({ alertLevel: "critical", reorderDate: PAST, daysOfStockRemaining: 300, spikePct: 0 }),
  );
  assert.deepEqual(r, [{ kind: "overdue", label: "reorder overdue" }]);
});
test("alertReasons: critical by spike only (healthy DSR, future reorder)", () => {
  const r = alertReasons(
    row({ alertLevel: "critical", reorderDate: "2999-01-01", daysOfStockRemaining: 300, spikePct: 22 }),
  );
  assert.deepEqual(r, [{ kind: "spike", label: "demand spike" }]);
});
test("alertReasons: critical by critically-low only", () => {
  const r = alertReasons(
    row({ alertLevel: "critical", reorderDate: "2999-01-01", daysOfStockRemaining: 20, spikePct: 0 }),
  );
  assert.deepEqual(r, [{ kind: "low_stock", label: "critically low stock" }]);
});

// ── critical, multiple drivers → headline priority overdue › low › spike ─────
test("alertReasons: overdue + low → headline overdue, both listed", () => {
  const r = alertReasons(
    row({ alertLevel: "critical", reorderDate: PAST, daysOfStockRemaining: 20, spikePct: 0 }),
  );
  assert.deepEqual(r, [
    { kind: "overdue", label: "reorder overdue" },
    { kind: "low_stock", label: "critically low stock" },
  ]);
  assert.equal(primaryAlertReason(row({ alertLevel: "critical", reorderDate: PAST, daysOfStockRemaining: 20 }))?.kind, "overdue");
});
test("alertReasons: all three drivers → order overdue, low, spike", () => {
  const r = alertReasons(
    row({ alertLevel: "critical", reorderDate: PAST, daysOfStockRemaining: 20, spikePct: 30 }),
  );
  assert.deepEqual(r.map((x) => x.kind), ["overdue", "low_stock", "spike"]);
});

// ── defensive fallback: critical badge, no derivable driver → warn + low stock ─
test("alertReasons: critical with no driver → fallback 'low stock' + console.warn", () => {
  const warnings: string[] = [];
  const orig = console.warn;
  console.warn = (m?: unknown) => {
    warnings.push(String(m));
  };
  try {
    const r = alertReasons(
      row({ alertLevel: "critical", reorderDate: "2999-01-01", daysOfStockRemaining: 300, spikePct: 0 }),
    );
    assert.deepEqual(r, [{ kind: "low_stock", label: "low stock" }]);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /no derivable driver/);
  } finally {
    console.warn = orig;
  }
});

// ── primaryAlertReason ───────────────────────────────────────────────────────
test("primaryAlertReason: null when ok", () => {
  assert.equal(primaryAlertReason(row({ alertLevel: "ok" })), null);
});
