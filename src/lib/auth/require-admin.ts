import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerComponentClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "./policy";

/** The authenticated user from the session cookie, or null. Server-only. */
export async function getSessionUser() {
  const supabase = await createServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

type AdminGate =
  | { admin: SupabaseClient; error: null }
  | { admin: null; error: Response };

/**
 * Gate for admin-only API routes. Returns the service-role client if the caller is
 * an admin, else a ready-to-return error Response:
 *   - not an admin (or no session)            → 403 forbidden  (holds during dormancy)
 *   - admin client can't be built / other err → 500 with a clear reason
 *     (most often: SUPABASE_SERVICE_ROLE_KEY not set in this environment)
 * Centralizes the try/catch so routes never crash with an unhandled 500.
 */
export async function requireAdmin(): Promise<AdminGate> {
  let isAdminUser = false;
  try {
    isAdminUser = isAdmin(await getSessionUser());
  } catch (e) {
    console.warn("requireAdmin: session check failed:", String(e));
    return { admin: null, error: Response.json({ error: "auth check failed" }, { status: 500 }) };
  }
  if (!isAdminUser) {
    return { admin: null, error: Response.json({ error: "forbidden" }, { status: 403 }) };
  }
  try {
    return { admin: createSupabaseAdminClient(), error: null };
  } catch (e) {
    console.warn("requireAdmin: admin client unavailable:", String(e));
    return {
      admin: null,
      error: Response.json(
        { error: "server not configured for admin actions (SUPABASE_SERVICE_ROLE_KEY missing)" },
        { status: 500 },
      ),
    };
  }
}
