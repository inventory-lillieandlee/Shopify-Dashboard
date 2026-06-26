import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client (@supabase/ssr) using the public anon key — the only
 * key that ever reaches the client. Used by /login and /set-password. Writes its
 * session to cookies the server client + middleware read back.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
