import { test } from "node:test";
import assert from "node:assert/strict";
import { isPublicPath, isAdmin, safeRedirectPath } from "./policy.ts";

// ── isPublicPath: only /login + /api bypass the session-refresh middleware ───
test("isPublicPath: app pages are NOT public (they get session-refresh, but are never gated)", () => {
  assert.equal(isPublicPath("/"), false);
  assert.equal(isPublicPath("/settings"), false);
  assert.equal(isPublicPath("/sku/7706691436753"), false);
});
test("isPublicPath: /login + all /api are public (skipped entirely)", () => {
  assert.equal(isPublicPath("/login"), true);
  assert.equal(isPublicPath("/api"), true);
  assert.equal(isPublicPath("/api/cron/recompute-and-alert"), true);
  assert.equal(isPublicPath("/api/settings/config"), true);
  assert.equal(isPublicPath("/api/products/add"), true);
});
test("isPublicPath: prefix boundaries are exact (no /loginx or /apix leak)", () => {
  assert.equal(isPublicPath("/loginx"), false);
  assert.equal(isPublicPath("/apix"), false);
  assert.equal(isPublicPath("/auth/confirm"), false); // magic-link flow is gone → not special
});

// ── safeRedirectPath: relative-only; reject open-redirect vectors (amendment 3) ──
test("safeRedirectPath: accepts same-origin absolute paths (query/hash preserved)", () => {
  assert.equal(safeRedirectPath("/"), "/");
  assert.equal(safeRedirectPath("/settings"), "/settings");
  assert.equal(safeRedirectPath("/sku/123"), "/sku/123");
  assert.equal(safeRedirectPath("/settings?tab=alerts#recipients"), "/settings?tab=alerts#recipients");
});
test("safeRedirectPath: rejects absolute URLs and scheme-bearing values → fallback", () => {
  assert.equal(safeRedirectPath("https://evil.com"), "/");
  assert.equal(safeRedirectPath("http://evil.com/path"), "/");
  assert.equal(safeRedirectPath("javascript:alert(1)"), "/");
  assert.equal(safeRedirectPath("mailto:x@y.com"), "/");
  assert.equal(safeRedirectPath("ftp://host/x"), "/");
  assert.equal(safeRedirectPath("evil.com"), "/"); // no leading slash
});
test("safeRedirectPath: rejects protocol-relative and backslash tricks → fallback", () => {
  assert.equal(safeRedirectPath("//evil.com"), "/");
  assert.equal(safeRedirectPath("/\\evil.com"), "/");
  assert.equal(safeRedirectPath("/\tfoo"), "/"); // control char
  assert.equal(safeRedirectPath("/foo\nbar"), "/"); // embedded newline
});
test("safeRedirectPath: empty / null / undefined / non-string → fallback", () => {
  assert.equal(safeRedirectPath(null), "/");
  assert.equal(safeRedirectPath(undefined), "/");
  assert.equal(safeRedirectPath(""), "/");
  assert.equal(safeRedirectPath(123 as unknown as string), "/");
});
test("safeRedirectPath: honors a custom fallback", () => {
  assert.equal(safeRedirectPath("https://evil.com", "/settings"), "/settings");
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
  assert.equal(isAdmin({ app_metadata: {}, ...{ user_metadata: { role: "admin" } } } as never), false);
});
