import { requireAdmin, getSessionUser } from "@/lib/auth/require-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// List team members. ADMIN-ONLY — 403 without an admin session; 500 with a clear
// reason if the service-role client can't be built. Includes `me` (the caller's id)
// so the UI can hide the remove action on the caller's own row.
export async function GET() {
  const { admin, error } = await requireAdmin();
  if (error) return error;
  try {
    const me = await getSessionUser();
    const { data, error: listErr } = await admin.auth.admin.listUsers();
    if (listErr) return Response.json({ error: "could not list users" }, { status: 500 });
    const users = data.users.map((u) => ({
      id: u.id,
      email: u.email ?? null,
      role: (u.app_metadata as { role?: string } | null)?.role ?? "member",
      status: u.email_confirmed_at || u.last_sign_in_at ? "accepted" : "pending",
      invitedAt: u.created_at ?? null,
    }));
    return Response.json({ users, me: me?.id ?? null });
  } catch (e) {
    console.warn("team list failed:", String(e));
    return Response.json({ error: "could not list users" }, { status: 500 });
  }
}

// Remove a user. ADMIN-ONLY. Covers both "cancel a pending invite" and "remove an
// active member" — deleting the auth user invalidates any outstanding invite link.
// Guard: an admin can't remove their own account (avoids self-lockout).
export async function DELETE(request: Request) {
  const { admin, error } = await requireAdmin();
  if (error) return error;

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "missing user id" }, { status: 400 });

  const me = await getSessionUser();
  if (me?.id === id) {
    return Response.json({ error: "You can't remove your own account." }, { status: 400 });
  }

  try {
    const { error: delErr } = await admin.auth.admin.deleteUser(id);
    if (delErr) return Response.json({ error: "could not remove user" }, { status: 500 });
    return Response.json({ ok: true });
  } catch (e) {
    console.warn("team delete failed:", String(e));
    return Response.json({ error: "could not remove user" }, { status: 500 });
  }
}
