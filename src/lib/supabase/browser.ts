import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client (@supabase/ssr) using the public anon key — the only
 * key that ever reaches the client. Used by /login (signInWithPassword) and the
 * header sign-out. Writes its session to cookies the server client + middleware
 * read back (so requireAdmin's cookie path sees the session).
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
