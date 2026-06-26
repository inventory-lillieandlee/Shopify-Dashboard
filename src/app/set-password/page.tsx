"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

// Invited users land here after /auth/confirm has set their session. They set a
// password, then proceed to the dashboard.
export default function SetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setWorking(true);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError("Could not set the password. Your invite link may have expired — sign in again.");
      setWorking(false);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h1 className="font-display text-2xl font-semibold text-brand">Set your password</h1>
        <p className="mt-1 text-sm text-muted-foreground">Choose a password to finish setting up your account.</p>

        <label className="mt-5 block text-sm">
          <span className="text-muted-foreground">New password</span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 h-10 w-full rounded-md border bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          />
        </label>
        <label className="mt-3 block text-sm">
          <span className="text-muted-foreground">Confirm password</span>
          <input
            type="password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="mt-1 h-10 w-full rounded-md border bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          />
        </label>

        {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}

        <button
          type="submit"
          disabled={working}
          className="mt-4 h-10 w-full rounded-md bg-brand font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {working ? "…" : "Set password & continue"}
        </button>
      </form>
    </main>
  );
}
