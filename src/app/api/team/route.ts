import { requireAdmin } from "@/lib/auth/require-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// List team members. ADMIN-ONLY — 403 without an admin session (holds during
// dormancy); 500 with a clear reason if the service-role client can't be built.
export async function GET() {
  const { admin, error } = await requireAdmin();
  if (error) return error;
  try {
    const { data, error: listErr } = await admin.auth.admin.listUsers();
    if (listErr) return Response.json({ error: "could not list users" }, { status: 500 });
    const users = data.users.map((u) => ({
      id: u.id,
      email: u.email ?? null,
      role: (u.app_metadata as { role?: string } | null)?.role ?? "member",
      status: u.email_confirmed_at || u.last_sign_in_at ? "accepted" : "pending",
      invitedAt: u.created_at ?? null,
    }));
    return Response.json({ users });
  } catch (e) {
    console.warn("team list failed:", String(e));
    return Response.json({ error: "could not list users" }, { status: 500 });
  }
}
