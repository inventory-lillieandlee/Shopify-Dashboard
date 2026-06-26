import { test } from "node:test";
import assert from "node:assert/strict";
import { decideDispatch, type PriorFire } from "./dedup.ts";

const NOW = new Date(Date.UTC(2026, 5, 26, 12, 0, 0)); // fixed "now"
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);
const fire = (alert_level: string, h: number): PriorFire => ({ alert_level, fired_at: hoursAgo(h) });

// ── the four required fixtures ───────────────────────────────────────────────
test("first fire: no priors → send", () => {
  assert.deepEqual(decideDispatch(NOW, "red", []), { send: true, reason: "first" });
});
test("same level < 24h → skip (duplicate)", () => {
  assert.deepEqual(decideDispatch(NOW, "red", [fire("red", 1)]), {
    send: false,
    reason: "duplicate",
  });
});
test("escalation red→critical → send", () => {
  assert.deepEqual(decideDispatch(NOW, "critical", [fire("red", 1)]), {
    send: true,
    reason: "escalation",
  });
});
test("expiry: same level ≥ 24h ago → send", () => {
  assert.deepEqual(decideDispatch(NOW, "red", [fire("red", 30)]), {
    send: true,
    reason: "expiry",
  });
});

// ── boundary + ordering robustness ───────────────────────────────────────────
test("exactly 24h is NOT < window → send (expiry)", () => {
  assert.equal(decideDispatch(NOW, "red", [fire("red", 24)]).send, true);
});
test("just under 24h → skip", () => {
  assert.equal(decideDispatch(NOW, "red", [fire("red", 23)]).send, false);
});
test("newest prior wins even if list is unordered", () => {
  // a recent red (1h) + an old red (40h): most-recent <24h ⇒ duplicate
  assert.equal(decideDispatch(NOW, "red", [fire("red", 40), fire("red", 1)]).send, false);
});
test("de-escalation critical→yellow with no prior yellow → send (first)", () => {
  assert.deepEqual(decideDispatch(NOW, "yellow", [fire("critical", 1)]), {
    send: true,
    reason: "first",
  });
});
test("same level <24h but a different older level present → still duplicate at this level", () => {
  assert.equal(
    decideDispatch(NOW, "critical", [fire("critical", 2), fire("red", 50)]).send,
    false,
  );
});
