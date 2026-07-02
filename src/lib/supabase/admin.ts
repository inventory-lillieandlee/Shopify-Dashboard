import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * SERVER-ONLY Supabase client using the SERVICE-ROLE key.
 *
 * ⚠️ The service-role key bypasses RLS and has full DB access. It is read ONLY
 * here, from server-side cron/route code. It powers the 6h cron writes (projections
 * upsert, alert_log insert) and the Settings write paths (config + recipients).
 * NEVER import this into a client component, NEVER expose the key as NEXT_PUBLIC_*.
 * The dashboard reads via the anon client only.
 */
export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY; // server-only secret — never NEXT_PUBLIC
  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL (server-only admin client)",
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * The service-role client, or a ready-to-return 500 Response if it can't be built
 * (usually SUPABASE_SERVICE_ROLE_KEY missing). Used by the de-gated Settings write
 * routes so they never crash with an unhandled error.
 */
export function adminClientOrError():
  | { admin: SupabaseClient; error: null }
  | { admin: null; error: Response } {
  try {
    return { admin: createSupabaseAdminClient(), error: null };
  } catch (e) {
    console.warn("adminClientOrError:", String(e));
    return {
      admin: null,
      error: Response.json(
        { error: "server not configured (SUPABASE_SERVICE_ROLE_KEY missing)" },
        { status: 500 },
      ),
    };
  }
}
