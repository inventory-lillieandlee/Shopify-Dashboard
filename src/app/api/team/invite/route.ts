import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Only two roles are invitable. "admin" unlocks Settings/Team/Alerts editing;
// "viewer" is read-only (any authenticated non-admin). Role is authoritative in
// app_metadata (service-role-only), never user_metadata.
const ROLES = new Set(["admin", "viewer"]);

// Invite a user by email with a role. ADMIN-ONLY (403/500 via requireAdmin). Uses
// Supabase's server-side invite → the token_hash email that lands on /auth/confirm
// (PKCE) → /set-password. Role is stamped into app_metadata right after the invite.
export async function POST(request: NextRequest) {
  const { admin, error } = await requireAdmin();
  if (error) return error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }

  const { email, role: rawRole } = (body as { email?: unknown; role?: unknown }) ?? {};
  if (typeof email !== "string" || email.length > 254 || !EMAIL_RE.test(email)) {
    return Response.json({ error: "a valid email is required" }, { status: 400 });
  }
  const role = typeof rawRole === "string" && ROLES.has(rawRole) ? rawRole : "viewer";

  try {
    const { origin } = new URL(request.url);
    const { data, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${origin}/set-password`,
    });
    if (inviteErr) {
      // Most common real failure: the email is already a member.
      const already = /already|registered|exists/i.test(inviteErr.message ?? "");
      return Response.json(
        { error: already ? "That email is already on the team." : "Invite failed — check the email and try again." },
        { status: already ? 409 : 502 },
      );
    }

    // Stamp the role securely (app_metadata is service-role-only, never user-set).
    const newId = data.user?.id;
    if (newId) {
      const { error: roleErr } = await admin.auth.admin.updateUserById(newId, {
        app_metadata: { role },
      });
      if (roleErr) {
        // Invite already went out; surface a soft warning rather than a hard fail.
        console.warn("invite: could not set role:", roleErr.message);
        return Response.json(
          { invited: { id: newId, email, role: "viewer" }, warning: "Invited, but role defaulted to viewer." },
          { status: 201 },
        );
      }
    }
    return Response.json({ invited: { id: newId ?? null, email, role } }, { status: 201 });
  } catch (e) {
    console.warn("invite failed:", String(e));
    return Response.json({ error: "invite failed" }, { status: 500 });
  }
}
