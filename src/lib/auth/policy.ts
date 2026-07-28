// Pure auth policy — the security-relevant path/role/redirect decisions, isolated
// and unit-tested. No I/O; every function takes plain args. ONE code path: there is
// no AUTH_ENABLED flag (removed) — the app is always in its single, real state.

// Paths the middleware does NOT touch (no session-cookie work, never redirected).
// - /login: the sign-in page itself.
// - /api/*: EXEMPT ON PURPOSE. API routes authorize themselves and return JSON
//   status codes — cron routes via the CRON_SECRET bearer (no cookie at all),
//   write routes via requireAdmin (401/403 JSON), GET /api/settings/config is
//   intentionally public. A middleware redirect here would break Vercel Cron and
//   every fetch() client (they'd get a 307 to HTML instead of their JSON). Do NOT
//   "fix" this by gating /api — per-route guards are the design.
const PUBLIC_PREFIXES = ["/login", "/api"];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Sanitize a post-login `redirect_to`. ONLY same-origin, absolute-path values are
 * allowed ("/settings", "/sku/123"). Everything else falls back to "/":
 *  - absolute/scheme-bearing URLs ("https://evil.com", "javascript:…") — open-redirect vector
 *  - protocol-relative ("//evil.com") — browsers treat these as absolute
 *  - anything not starting with a single "/"
 * Query/hash on an otherwise-relative path are preserved.
 */
export function safeRedirectPath(value: string | null | undefined, fallback = "/"): string {
  if (typeof value !== "string" || value.length === 0) return fallback;
  if (value[0] !== "/") return fallback; // must be an absolute path
  if (value[1] === "/" || value[1] === "\\") return fallback; // "//host" or "/\host" → treated as absolute
  if (/[\x00-\x1f]/.test(value)) return fallback; // control chars (incl. embedded newlines/tabs)
  return value;
}

// Minimal shape of a Supabase user for the role check. app_metadata is typed as an
// index map (matching @supabase's UserAppMetadata) so the real User assigns cleanly.
interface UserLike {
  // app_metadata is set server-side (service-role) and is NOT user-editable — the
  // only trustworthy place for an authorization role.
  app_metadata?: Record<string, unknown> | null;
}

/**
 * Admin = role "admin" in app_metadata. Default-deny: no user → false.
 *
 * SECURITY: check app_metadata, NOT user_metadata. user_metadata is editable by the
 * user via auth.updateUser(), so trusting it for authorization would let any signed-in
 * user self-promote. app_metadata can only be set with the service-role key.
 * (requireAdmin enforces this at the route layer; this mirror keeps it unit-testable.)
 */
export function isAdmin(user: UserLike | null | undefined): boolean {
  return user?.app_metadata?.role === "admin";
}
