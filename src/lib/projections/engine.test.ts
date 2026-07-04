import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeDDR,
  computeDSR,
  reorderHorizonDays,
  computeReorderDate,
  isReorderOverdue,
  projected7d,
  computeSpikePct,
  deriveThresholds,
  classifyAlert,
  computeProjection,
  NO_DEMAND_DSR,
} from "./engine.ts";

const close = (a: number, b: number, eps = 1e-9) =>
  assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

// ── 1. computeDDR ────────────────────────────────────────────────────────────
test("computeDDR: flat 8% growth, no renewals", () => {
  close(computeDDR({ base_daily_demand: 10, upcoming_renewals_30d: 0 }), 10.8);
});
test("computeDDR: adds renewals/30", () => {
  close(computeDDR({ base_daily_demand: 10, upcoming_renewals_30d: 30 }), 11.8); // 10.8 + 1
});
test("computeDDR: explicit growth override", () => {
  close(computeDDR({ base_daily_demand: 100, upcoming_renewals_30d: 0, growth: 1.0 }), 100);
});

// ── 2. computeDSR (+ sentinel) ──────────────────────────────────────────────
test("computeDSR: inventory / ddr", () => {
  close(computeDSR(360, 12), 30);
});
test("computeDSR guard: ddr = 0 → sentinel (no demand / no risk)", () => {
  assert.equal(computeDSR(100, 0), NO_DEMAND_DSR);
  assert.equal(Number.isFinite(computeDSR(100, 0)), false);
});
test("computeDSR guard: ddr < 0 → sentinel", () => {
  assert.equal(computeDSR(100, -5), NO_DEMAND_DSR);
});

// ── 3. reorder date / overdue ───────────────────────────────────────────────
test("reorderHorizonDays: dsr - lead - safety", () => {
  close(reorderHorizonDays(200, 98, 30), 72);
});
test("reorderHorizonDays: negative = overdue", () => {
  assert.ok(reorderHorizonDays(66, 98, 30) < 0);
  assert.equal(isReorderOverdue(66, 98, 30), true);
  assert.equal(isReorderOverdue(200, 98, 30), false);
});
test("computeReorderDate: future vs overdue vs no-demand", () => {
  const today = new Date(Date.UTC(2026, 5, 26)); // 2026-06-26
  assert.ok(computeReorderDate(today, 200, 98, 30)!.getTime() > today.getTime()); // future
  assert.ok(computeReorderDate(today, 66, 98, 30)!.getTime() < today.getTime()); // overdue
  assert.equal(computeReorderDate(today, NO_DEMAND_DSR, 98, 30), null); // no demand
});

// ── 4. computeSpikePct (+ guard) ────────────────────────────────────────────
test("computeSpikePct: 20% above plan", () => {
  close(computeSpikePct(projected7d(12) * 1.2, projected7d(12)), 20); // actual 20% over projected (84)
});
test("computeSpikePct: known +20%", () => {
  close(computeSpikePct(84, 70), 20);
  close(computeSpikePct(70, 70), 0);
});
test("computeSpikePct guard: projected_7d = 0 → 0", () => {
  assert.equal(computeSpikePct(50, 0), 0);
  assert.equal(computeSpikePct(50, -3), 0);
});

// ── 5. deriveThresholds (reproduces roadmap 150/90 + fills gaps) ─────────────
test("deriveThresholds: chews (98,30) → {30,138,150}", () => {
  assert.deepEqual(deriveThresholds(98, 30), { critical: 30, red: 138, yellow: 150 });
});
test("deriveThresholds: cbd (49,30) → {30,84,90}", () => {
  assert.deepEqual(deriveThresholds(49, 30), { critical: 30, red: 84, yellow: 90 });
});
test("deriveThresholds: salmon_oil (56,30) → derived (fills §3 gap)", () => {
  assert.deepEqual(deriveThresholds(56, 30), { critical: 30, red: 92, yellow: 98 });
});

// ── classifyAlert: one fixture per tier (chews thresholds {30,138,150}) ──────
const CHEWS = deriveThresholds(98, 30);
test("classifyAlert: ok", () => {
  assert.equal(classifyAlert(300, false, 0, CHEWS), "ok");
});
test("classifyAlert: yellow", () => {
  assert.equal(classifyAlert(145, false, 0, CHEWS), "yellow"); // 138 < 145 ≤ 150
});
test("classifyAlert: red", () => {
  assert.equal(classifyAlert(135, false, 0, CHEWS), "red"); // 30 < 135 ≤ 138
});
test("classifyAlert: critical by DSR cutoff", () => {
  assert.equal(classifyAlert(20, false, 0, CHEWS), "critical"); // ≤ 30
});
test("classifyAlert: critical by overdue", () => {
  assert.equal(classifyAlert(100, true, 0, CHEWS), "critical");
});
test("classifyAlert: spike + low stock (DSR ≤ red) ⇒ critical", () => {
  // spike escalates to critical ONLY when stock is also low (DSR ≤ red = 138)
  assert.equal(classifyAlert(100, false, 15, CHEWS), "critical"); // 100 ≤ 138
  assert.equal(classifyAlert(135, false, 22, CHEWS), "critical"); // 135 ≤ 138
});
test("classifyAlert: spike + well-stocked (DSR > red) ⇒ NOT critical, keeps stock tier", () => {
  // well-stocked spike stays on its stock tier; the ▲% indicator carries the signal
  assert.equal(classifyAlert(300, false, 22, CHEWS), "ok"); // 300 > 150 → ok
  assert.equal(classifyAlert(145, false, 41, CHEWS), "yellow"); // 138 < 145 ≤ 150 → yellow
});

// ── ROADMAP WORKED EXAMPLE (the gate) ───────────────────────────────────────
// Hip & Joint: inventory 800, DDR 12 → DSR 66 → reorder overdue → CRITICAL.
test("GATE: Hip & Joint (inv 800, DDR 12) → DSR 66 → overdue → CRITICAL", () => {
  const dsr = computeDSR(800, 12);
  close(dsr, 66.6667, 1e-3); // 800/12
  assert.ok(Math.round(dsr) === 67 || Math.floor(dsr) === 66); // ~66
  assert.equal(isReorderOverdue(dsr, 98, 30), true); // 66 - 128 < 0
  assert.equal(classifyAlert(dsr, true, 0, deriveThresholds(98, 30)), "critical");

  // …and end-to-end through computeProjection (base reconstructs DDR 12):
  const r = computeProjection({
    base_daily_demand: 12 / 1.08,
    upcoming_renewals_30d: 0,
    shopify_units: 800,
    lead_time_days: 98,
    safety_stock_days: 30,
    actual_7d: projected7d(12), // spike 0
    today: new Date(Date.UTC(2026, 5, 26)),
  });
  close(r.daily_demand_rate, 12, 1e-9);
  close(r.days_of_stock_remaining, 66.6667, 1e-3);
  assert.equal(r.alert_level, "critical");
});
