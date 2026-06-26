import { requireAdmin } from "@/lib/auth/require-admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// List team members. ADMIN-ONLY — self-authorizes (403 without an admin session),
// which holds even during dormancy (no session → 403). Uses the service-role
// admin client server-side only.
export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const admin = createSupabaseAdminClient(); // service-role — server-only
  const { data, error: listErr } = await admin.auth.admin.listUsers();
  if (listErr) {
    return Response.json({ error: "could not list users" }, { status: 500 });
  }

  const users = data.users.map((u) => ({
    id: u.id,
    email: u.email ?? null,
    role: (u.app_metadata as { role?: string } | null)?.role ?? "member",
    status: u.email_confirmed_at || u.last_sign_in_at ? "accepted" : "pending",
    invitedAt: u.created_at ?? null,
  }));

  return Response.json({ users });
}
