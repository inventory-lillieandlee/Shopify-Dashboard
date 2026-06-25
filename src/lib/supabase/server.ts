import { createClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client for the dashboard (read-only usage).
 *
 * Uses the public anon/publishable key — safe to expose; reads are gated by
 * RLS/grants. Intended for use in Server Components only. Created per call so it
 * never leaks across requests; no session persistence on the server.
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
