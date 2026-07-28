import { createServerComponentClient } from "@/lib/supabase/server";

export type AdminGate = { ok: true; userId: string; email: string | null } | { ok: false; response: Response };

/**
 * Server-side admin gate for write routes. Reads the Supabase session and requires
 * `app_metadata.role === 'admin'` — app_metadata is server-controlled, NOT user_metadata
 * (which a signed-in user can edit; trusting it would be a self-promotion backdoor).
 *
 * Cookie session FIRST (production/browser path); a Bearer access token is a fallback for
 * scripts/API clients. Both are fully validated by getUser().
 *
 * NOTE: this app currently has no login flow (removed in b17305b), so no admin session can
 * be obtained through the UI yet → gated routes return 401 until login is restored. The
 * gate is correct and drop-in; see the auth-restore scope. Two role=admin users already
 * exist in auth.users from a prior phase.
 */
export async function requireAdmin(req?: Request): Promise<AdminGate> {
  const supabase = await createServerComponentClient();
  const authz = req?.headers.get("authorization") ?? "";
  const bearer = authz.startsWith("Bearer ") ? authz.slice(7).trim() : null;
  let { data, error } = await supabase.auth.getUser();
  if ((error || !data?.user) && bearer) ({ data, error } = await supabase.auth.getUser(bearer));
  const user = data?.user;
  if (error || !user) {
    return { ok: false, response: Response.json({ error: "unauthorized" }, { status: 401 }) };
  }
  const role = (user.app_metadata as { role?: string } | null | undefined)?.role;
  if (role !== "admin") {
    return { ok: false, response: Response.json({ error: "forbidden — admin only" }, { status: 403 }) };
  }
  return { ok: true, userId: user.id, email: user.email ?? null };
}
