"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { LogIn, LogOut } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

/**
 * Header auth control. The dashboard is open, so this is a capability, not a wall:
 *  - signed out → a quiet "Sign in" link (carries redirect_to = current page)
 *  - signed in  → the email + a "Sign out" button (browser signOut → back to /login)
 * State comes from the browser client (getUser + onAuthStateChange) so it reflects
 * sign-in/out without a full reload.
 */
export function UserMenu() {
  const router = useRouter();
  const pathname = usePathname();
  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setEmail(data.user?.email ?? null);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setEmail(session?.user?.email ?? null);
      setReady(true);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function signOut() {
    setBusy(true);
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  if (!ready) {
    // Reserve the row height; avoid a flash of the wrong control before we know.
    return <span className="h-9 w-px" aria-hidden />;
  }

  if (!email) {
    const redirect = pathname && pathname !== "/login" ? `?redirect_to=${encodeURIComponent(pathname)}` : "";
    return (
      <Link
        href={`/login${redirect}`}
        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-sm font-medium text-muted-foreground transition-colors hover:border-brand-sage/60 hover:text-brand focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
      >
        <LogIn className="size-4" /> Sign in
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="hidden max-w-[16ch] truncate text-xs text-muted-foreground sm:inline" title={email}>
        {email}
      </span>
      <button
        type="button"
        onClick={signOut}
        disabled={busy}
        title="Sign out"
        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-sm font-medium text-muted-foreground transition-colors hover:border-brand-sage/60 hover:text-brand focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none disabled:opacity-50"
      >
        <LogOut className="size-4" /> {busy ? "Signing out…" : "Sign out"}
      </button>
    </div>
  );
}
