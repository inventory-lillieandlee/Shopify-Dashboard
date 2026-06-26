"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const redirectTo = params.get("redirect_to") || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "working" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus("working");
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError("Sign-in failed. Check your email and password.");
      setStatus("idle");
      return;
    }
    router.replace(redirectTo);
    router.refresh();
  }

  async function magicLink() {
    setError(null);
    if (!email) {
      setError("Enter your email first.");
      return;
    }
    setStatus("working");
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/confirm?redirect_to=${encodeURIComponent(redirectTo)}` },
    });
    setStatus(error ? "idle" : "sent");
    if (error) setError("Could not send the magic link. Try again.");
  }

  return (
    <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-sm">
      <h1 className="font-display text-2xl font-semibold text-brand">Sign in</h1>
      <p className="mt-1 text-sm text-muted-foreground">Lillie &amp; Lee — Inventory · invite-only</p>

      <form onSubmit={signIn} className="mt-5 space-y-3">
        <label className="block text-sm">
          <span className="text-muted-foreground">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 h-10 w-full rounded-md border bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          />
        </label>
        <label className="block text-sm">
          <span className="text-muted-foreground">Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 h-10 w-full rounded-md border bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          />
        </label>

        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        {status === "sent" ? (
          <p className="text-sm text-emerald-700">Magic link sent — check your inbox.</p>
        ) : null}

        <button
          type="submit"
          disabled={status === "working"}
          className="h-10 w-full rounded-md bg-brand font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {status === "working" ? "…" : "Sign in"}
        </button>
      </form>

      <button
        type="button"
        onClick={magicLink}
        disabled={status === "working"}
        className="mt-2 h-10 w-full rounded-md border bg-card text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
      >
        Email me a magic link
      </button>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
