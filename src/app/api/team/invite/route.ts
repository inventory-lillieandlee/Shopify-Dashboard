import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { sendEmail } from "@/lib/email/mailer";
import { renderInviteEmail } from "@/lib/email/invite-template";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Only two roles are invitable. "admin" unlocks Settings/Team/Alerts editing;
// "viewer" is read-only (any authenticated non-admin). Role is authoritative in
// app_metadata (service-role-only), never user_metadata.
const ROLES = new Set(["admin", "viewer"]);

// Invite a user by email with a role. ADMIN-ONLY (403/500 via requireAdmin).
// We generate the invite token ourselves (generateLink — does NOT send any email)
// and deliver a BRANDED invite via Resend, so we never depend on Supabase's mailer.
// The link points at our PKCE confirm route → /set-password.
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
  const role = (typeof rawRole === "string" && ROLES.has(rawRole) ? rawRole : "viewer") as "admin" | "viewer";

  try {
    const { origin } = new URL(request.url);

    // Create the invited user + mint the token WITHOUT sending Supabase's email.
    const { data, error: linkErr } = await admin.auth.admin.generateLink({
      type: "invite",
      email,
      options: { redirectTo: `${origin}/set-password` },
    });
    if (linkErr || !data?.properties?.hashed_token || !data.user) {
      const already = /already|registered|exists/i.test(linkErr?.message ?? "");
      return Response.json(
        { error: already ? "That email is already on the team." : "Could not create the invite." },
        { status: already ? 409 : 502 },
      );
    }

    const userId = data.user.id;
    const tokenHash = data.properties.hashed_token;
    // Verify server-side via our own confirm route (sets the session, then →/set-password).
    const inviteUrl =
      `${origin}/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}` +
      `&type=invite&redirect_to=${encodeURIComponent("/set-password")}`;

    // Send the branded invite. If this fails, roll back the just-created user so the
    // admin can retry cleanly (no orphaned "pending" row that never got an email).
    const { subject, html } = renderInviteEmail({ inviteUrl, role });
    try {
      await sendEmail({ to: [email], subject, html });
    } catch (e) {
      await admin.auth.admin.deleteUser(userId).catch(() => {});
      console.warn("invite email failed:", String(e));
      return Response.json(
        { error: "Couldn't send the invite email — check the Resend setup and try again." },
        { status: 502 },
      );
    }

    // Stamp the role securely (app_metadata is service-role-only, never user-set).
    const { error: roleErr } = await admin.auth.admin.updateUserById(userId, { app_metadata: { role } });
    if (roleErr) {
      console.warn("invite: could not set role:", roleErr.message);
      return Response.json(
        { invited: { id: userId, email, role: "viewer" }, warning: "Invited, but role defaulted to viewer." },
        { status: 201 },
      );
    }

    return Response.json({ invited: { id: userId, email, role } }, { status: 201 });
  } catch (e) {
    console.warn("invite failed:", String(e));
    return Response.json({ error: "invite failed" }, { status: 500 });
  }
}
