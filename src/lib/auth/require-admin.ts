import { createServerComponentClient } from "@/lib/supabase/server";
import { isAdmin } from "./policy";

/** The authenticated user from the session cookie, or null. Server-only. */
export async function getSessionUser() {
  const supabase = await createServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * Gate for admin-only API routes. Returns the user if they're an admin, else a
 * ready-to-return 403 Response. Default-deny — holds during dormancy too (no
 * session → 403). NEVER trusts client-supplied identity (getUser validates the
 * session against Supabase; role is read from server-set app_metadata).
 */
export async function requireAdmin(): Promise<
  { user: NonNullable<Awaited<ReturnType<typeof getSessionUser>>>; error: null } | { user: null; error: Response }
> {
  const user = await getSessionUser();
  if (!isAdmin(user)) {
    return {
      user: null,
      error: Response.json({ error: "forbidden" }, { status: 403 }),
    };
  }
  return { user: user!, error: null };
}
