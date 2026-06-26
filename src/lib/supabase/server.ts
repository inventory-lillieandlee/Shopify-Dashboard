import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Plain anon server client (no cookies). Used by the cron route's direct reads
 * (alert_log, recompute inputs) — a non-interactive job with no user session.
 *
 * Uses the public anon/publishable key — safe to expose; reads are gated by
 * RLS/grants. Created per call so it never leaks across requests.
 */
export function createSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing Supabase env. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local",
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Cookie/session-aware server client (@supabase/ssr) using the ANON key.
 *
 * BACKWARD-COMPATIBLE: with no session cookie it behaves exactly as the anon
 * client (anon RLS) — so the public dashboard renders identically in dormant
 * mode. When auth is live, it carries the signed-in user's session so reads run
 * under that identity (the future authenticated-RLS). This is the client
 * getInventoryRows() uses; its contract is unchanged.
 */
export async function createServerComponentClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing Supabase env. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local",
    );
  }
  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, where cookies are read-only — no-op.
          // The middleware refreshes the session cookie on each request.
        }
      },
    },
  });
}
