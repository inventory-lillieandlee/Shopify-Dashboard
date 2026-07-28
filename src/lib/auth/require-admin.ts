import { createServerComponentClient } from "@/lib/supabase/server";

export type AdminGate = { ok: true; userId: string; email: string | null } | { ok: false; response: Response };

/**
 * Server-side admin gate for write routes. Reads the Supabase session from the request
 * cookies and requires `app_metadata.role === 'admin'`.
 *
 * app_metadata is set by the server / auth-admin API and is NOT user-editable — unlike
 * user_metadata, which a signed-in user can change themselves. Trusting user_metadata for
 * authorization is the self-promotion backdoor rejected in Phase E, so we read
 * app_metadata ONLY.
 *
 * ⚠️ This app currently has NO login flow (a prior task removed it), so there is no way to
 * obtain an admin session yet → every gated route returns 401 for all callers until a
 * login is restored. The gate itself is correct and drop-in; wiring Google sign-in is a
 * separate task. Routes that also run on a cron accept the CRON_SECRET bearer as an
 * alternate credential (see /api/catalog/sync).
 */
export async function requireAdmin(req?: Request): Promise<AdminGate> {
  const supabase = await createServerComponentClient();
  // Cookie session FIRST — the production/browser path. Fall back to a Bearer access token
  // (scripts / API clients) only when there is no cookie session. Both are fully validated
  // by getUser(); the narrower browser path takes precedence over the wider Bearer surface.
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
