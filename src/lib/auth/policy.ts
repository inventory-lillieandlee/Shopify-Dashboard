// Pure auth policy — the security-critical decisions, isolated and unit-tested.
// No I/O beyond reading the AUTH_ENABLED flag; path/role checks take plain args.

/** Dormant by default. ONLY the exact string "true" enables auth. */
export function isAuthEnabled(): boolean {
  return process.env.AUTH_ENABLED === "true";
}

// Paths that bypass the auth redirect even when auth is ON.
// - /login, /auth/*, /set-password: the sign-in / invite-confirm flow itself.
// - /api/*: API routes self-authorize (cron via CRON_SECRET, team via admin check),
//   so they must NOT be redirected — they return their own 401/403 as JSON.
const PUBLIC_PREFIXES = ["/login", "/auth", "/set-password", "/api"];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

// Minimal shape of a Supabase user for the role check. app_metadata is typed as
// an index map (matching @supabase's UserAppMetadata) so the real User assigns
// cleanly; role is read as unknown and compared to the literal.
interface UserLike {
  // app_metadata is set server-side (service-role) and is NOT user-editable —
  // the only trustworthy place for an authorization role.
  app_metadata?: Record<string, unknown> | null;
}

/**
 * Admin = role "admin" in app_metadata. Default-deny: no user → false.
 *
 * SECURITY: we deliberately check app_metadata, NOT user_metadata. user_metadata
 * is editable by the user via auth.updateUser(), so trusting it for authorization
 * would let any signed-in user self-promote to admin. app_metadata can only be set
 * with the service-role key (see the go-live runbook's "create first admin" step).
 */
export function isAdmin(user: UserLike | null | undefined): boolean {
  return user?.app_metadata?.role === "admin";
}
