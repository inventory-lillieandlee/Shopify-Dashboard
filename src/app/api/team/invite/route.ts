import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Invite a user by email. ADMIN-ONLY (403/500 via requireAdmin). Uses Supabase's
// server-side invite → the token_hash email that lands on /auth/confirm (PKCE).
export async function POST(request: NextRequest) {
  const { admin, error } = await requireAdmin();
  if (error) return error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }

  // Validate + bound the only external input.
  const email = (body as { email?: unknown })?.email;
  if (typeof email !== "string" || email.length > 254 || !EMAIL_RE.test(email)) {
    return Response.json({ error: "a valid email is required" }, { status: 400 });
  }

  try {
    const { origin } = new URL(request.url);
    const { data, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${origin}/set-password`,
    });
    if (inviteErr) return Response.json({ error: "invite failed" }, { status: 502 });
    return Response.json({ invited: { id: data.user?.id ?? null, email } }, { status: 201 });
  } catch (e) {
    console.warn("invite failed:", String(e));
    return Response.json({ error: "invite failed" }, { status: 500 });
  }
}
