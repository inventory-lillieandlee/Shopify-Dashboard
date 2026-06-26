import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Invite a user by email. ADMIN-ONLY — self-authorizes (403 without an admin
// session, incl. during dormancy). Uses Supabase's server-side invite, which
// sends the token_hash email that lands on /auth/confirm (the PKCE flow).
export async function POST(request: NextRequest) {
  const { error } = await requireAdmin();
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

  const admin = createSupabaseAdminClient(); // service-role — server-only
  const { origin } = new URL(request.url);
  const { data, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${origin}/set-password`,
  });
  if (inviteErr) {
    // Generic to the client; detail stays server-side.
    return Response.json({ error: "invite failed" }, { status: 502 });
  }

  return Response.json({ invited: { id: data.user?.id ?? null, email } }, { status: 201 });
}
