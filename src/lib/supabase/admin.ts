import { createClient } from "@supabase/supabase-js";

/**
 * SERVER-ONLY Supabase client using the SERVICE-ROLE key.
 *
 * ⚠️ The service-role key bypasses RLS and has full DB access. It is read ONLY
 * here, from server-side cron/route code, and is used solely for the two writes
 * this project's 6h cron performs: the projections upsert (scheduled recompute)
 * and the alert_log insert. NEVER import this into a client component, NEVER
 * expose the key as NEXT_PUBLIC_*. The dashboard reads via the anon client only.
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
