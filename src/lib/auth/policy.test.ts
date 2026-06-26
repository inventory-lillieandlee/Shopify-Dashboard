import { test } from "node:test";
import assert from "node:assert/strict";
import { isAuthEnabled, isPublicPath, isAdmin } from "./policy.ts";

// ── isAuthEnabled: dormant by default, strict "true" ─────────────────────────
test("isAuthEnabled: only 'true' enables; default/other = false", () => {
  const orig = process.env.AUTH_ENABLED;
  try {
    delete process.env.AUTH_ENABLED;
    assert.equal(isAuthEnabled(), false);
    process.env.AUTH_ENABLED = "false";
    assert.equal(isAuthEnabled(), false);
    process.env.AUTH_ENABLED = "TRUE"; // case-sensitive on purpose
    assert.equal(isAuthEnabled(), false);
    process.env.AUTH_ENABLED = "1";
    assert.equal(isAuthEnabled(), false);
    process.env.AUTH_ENABLED = "true";
    assert.equal(isAuthEnabled(), true);
  } finally {
    if (orig === undefined) delete process.env.AUTH_ENABLED;
    else process.env.AUTH_ENABLED = orig;
  }
});

// ── isPublicPath: protected pages redirect; auth flow + APIs + static bypass ──
test("isPublicPath: protected app routes are NOT public", () => {
  assert.equal(isPublicPath("/"), false);
  assert.equal(isPublicPath("/settings"), false);
  assert.equal(isPublicPath("/sku/7706691436753"), false);
});
test("isPublicPath: auth flow + APIs are public (self-authorizing)", () => {
  assert.equal(isPublicPath("/login"), true);
  assert.equal(isPublicPath("/auth/confirm"), true);
  assert.equal(isPublicPath("/set-password"), true);
  assert.equal(isPublicPath("/api/cron/recompute-and-alert"), true);
  assert.equal(isPublicPath("/api/team/invite"), true);
});
test("isPublicPath: prefix boundaries are exact (no /loginx leak)", () => {
  assert.equal(isPublicPath("/loginx"), false);
  assert.equal(isPublicPath("/authentication"), false);
});

// ── isAdmin: app_metadata only, default-deny, user_metadata NOT trusted ──────
test("isAdmin: app_metadata.role === 'admin' → true", () => {
  assert.equal(isAdmin({ app_metadata: { role: "admin" } }), true);
});
test("isAdmin: non-admin / missing / null → false", () => {
  assert.equal(isAdmin({ app_metadata: { role: "member" } }), false);
  assert.equal(isAdmin({ app_metadata: {} }), false);
  assert.equal(isAdmin({}), false);
  assert.equal(isAdmin(null), false);
  assert.equal(isAdmin(undefined), false);
});
test("isAdmin: user_metadata role is IGNORED (anti privilege-escalation)", () => {
  // a user could set this themselves — it must never grant admin
  assert.equal(isAdmin({ app_metadata: {}, ...{ user_metadata: { role: "admin" } } } as never), false);
});
