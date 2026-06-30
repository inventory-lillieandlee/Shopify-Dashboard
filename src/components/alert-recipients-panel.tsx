"use client";

import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { cn } from "@/lib/utils";
import { surfacePanel } from "@/lib/surface";
import { Select } from "@/components/ui/select";

interface Recipient {
  id: string;
  email: string;
  min_level: "yellow" | "red" | "critical";
  active: boolean;
}

type Load =
  | { state: "loading" }
  | { state: "forbidden" }
  | { state: "error"; message: string }
  | { state: "ready"; recipients: Recipient[] };

export function AlertRecipientsPanel() {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [email, setEmail] = useState("");
  const [minLevel, setMinLevel] = useState<"yellow" | "red" | "critical">("red");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const res = await fetch("/api/settings/recipients", { cache: "no-store" });
    if (res.status === 403) return setLoad({ state: "forbidden" });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      return setLoad({ state: "error", message: j.error || `Failed (${res.status})` });
    }
    const json = (await res.json()) as { recipients: Recipient[] };
    setLoad({ state: "ready", recipients: json.recipients });
  }

  useEffect(() => {
    refresh().catch(() => setLoad({ state: "error", message: "Network error" }));
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setBusy(true);
    const res = await fetch("/api/settings/recipients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, min_level: minLevel }),
    });
    setBusy(false);
    if (res.ok) {
      setEmail("");
      setMsg(`Added ${email}.`);
      refresh().catch(() => {});
    } else {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setMsg(j.error ? `Could not add: ${j.error}` : "Could not add.");
    }
  }

  async function remove(id: string) {
    await fetch(`/api/settings/recipients?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    refresh().catch(() => {});
  }

  if (load.state === "loading") {
    return <Shell><p className="text-sm text-muted-foreground">Loading recipients…</p></Shell>;
  }
  if (load.state === "forbidden") {
    return (
      <Shell center>
        <span className="flex size-11 items-center justify-center rounded-full bg-muted text-brand-sage">
          <BellRing className="size-5" />
        </span>
        <h2 className="font-display text-lg font-semibold text-brand">Admin sign-in required</h2>
        <p className="mx-auto max-w-md text-sm text-muted-foreground">
          Alert recipients are admin-only. While auth is dormant no one is signed in, so this is inert
          by design — it activates after the first admin is created at go-live.
        </p>
      </Shell>
    );
  }
  if (load.state === "error") {
    return <Shell><p className="text-sm text-red-700">{load.message}</p></Shell>;
  }

  return (
    <Shell>
      <div className="flex items-center gap-2">
        <BellRing className="size-4 text-brand-sage" />
        <h2 className="font-display text-lg font-semibold text-brand">Alert recipients</h2>
        <span className="text-sm text-muted-foreground">{load.recipients.length} configured</span>
      </div>
      <p className="text-sm text-muted-foreground">
        Who gets the email alerts. Each recipient's minimum level controls which tiers reach them
        (e.g. <em>critical</em> = only the most urgent).
      </p>

      <form onSubmit={add} className="flex flex-wrap items-center gap-2">
        <input
          type="email"
          required
          placeholder="add recipient email…"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-9 min-w-56 flex-1 rounded-md border bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        />
        <Select
          value={minLevel}
          onChange={(e) => setMinLevel(e.target.value as typeof minLevel)}
          containerClassName="w-40"
        >
          <option value="yellow">Yellow+ (all)</option>
          <option value="red">Red+</option>
          <option value="critical">Critical only</option>
        </Select>
        <button
          type="submit"
          disabled={busy}
          className="h-9 rounded-md bg-brand px-3 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "…" : "Add"}
        </button>
      </form>
      {msg ? <p className="text-sm text-muted-foreground">{msg}</p> : null}

      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 font-medium">Email</th>
              <th className="px-3 py-2 font-medium">Min level</th>
              <th className="px-3 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {load.recipients.length === 0 ? (
              <tr><td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">No recipients yet — alerts won't be emailed to anyone.</td></tr>
            ) : (
              load.recipients.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-3 py-2">{r.email}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.min_level}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => remove(r.id)}
                      className="text-xs text-red-700 hover:underline"
                    >
                      remove
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}

function Shell({ children, center }: { children: React.ReactNode; center?: boolean }) {
  return (
    <section
      className={cn(
        surfacePanel,
        "animate-in space-y-4 p-5 duration-500 fade-in",
        center && "flex flex-col items-center gap-3 p-10 text-center",
      )}
    >
      {children}
    </section>
  );
}
