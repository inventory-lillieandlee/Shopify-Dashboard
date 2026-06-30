"use client";

import { useEffect, useState } from "react";
import { Users, ShieldCheck, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { surfacePanel } from "@/lib/surface";
import { Select } from "@/components/ui/select";

type Role = "admin" | "viewer";
interface Member {
  id: string;
  email: string | null;
  role: string;
  status: "pending" | "accepted";
}

type Load =
  | { state: "loading" }
  | { state: "forbidden" }
  | { state: "error"; message: string }
  | { state: "ready"; users: Member[] };

type Msg = { kind: "ok" | "err"; text: string } | null;

const isAdminRole = (r: string) => r === "admin";

export function TeamPanel() {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("viewer");
  const [msg, setMsg] = useState<Msg>(null);
  const [inviting, setInviting] = useState(false);

  async function refresh() {
    const res = await fetch("/api/team", { cache: "no-store" });
    if (res.status === 403) return setLoad({ state: "forbidden" });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      return setLoad({ state: "error", message: j.error || `Failed (${res.status})` });
    }
    const json = (await res.json()) as { users: Member[] };
    setLoad({ state: "ready", users: json.users });
  }

  useEffect(() => {
    refresh().catch(() => setLoad({ state: "error", message: "Network error" }));
  }, []);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setInviting(true);
    const res = await fetch("/api/team/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role }),
    });
    setInviting(false);
    const j = (await res.json().catch(() => ({}))) as { error?: string; warning?: string };
    if (res.ok) {
      const label = role === "admin" ? "an admin" : "a viewer";
      setMsg({ kind: "ok", text: j.warning ?? `Invited ${email} as ${label} — they'll get an email to set a password.` });
      setEmail("");
      setRole("viewer");
      refresh().catch(() => {});
    } else {
      setMsg({ kind: "err", text: j.error || "Could not send the invite." });
    }
  }

  if (load.state === "loading") {
    return <Shell><p className="text-sm text-muted-foreground">Loading team…</p></Shell>;
  }

  if (load.state === "forbidden") {
    return (
      <Shell center>
        <span className="flex size-11 items-center justify-center rounded-full bg-muted text-brand-sage">
          <Users className="size-5" />
        </span>
        <h2 className="font-display text-lg font-semibold text-brand">Admin sign-in required</h2>
        <p className="mx-auto max-w-md text-sm text-muted-foreground">
          Team management is admin-only. Sign in with an admin account to invite teammates and manage roles.
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
        <Users className="size-4 text-brand-sage" />
        <h2 className="font-display text-lg font-semibold text-brand">Team</h2>
        <span className="text-sm text-muted-foreground">{load.users.length} members</span>
      </div>
      <p className="text-sm text-muted-foreground">
        Invite teammates by email and choose their access. <strong className="font-medium text-foreground">Admins</strong> can
        edit settings, alerts, and the team; <strong className="font-medium text-foreground">viewers</strong> can see the
        dashboard only.
      </p>

      <form onSubmit={invite} className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-56 flex-1 flex-col gap-1 text-xs text-muted-foreground">
          Email
          <input
            type="email"
            required
            placeholder="teammate@lillieandlee.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-9 rounded-md border bg-card px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Access
          <Select value={role} onChange={(e) => setRole(e.target.value as Role)} containerClassName="w-40">
            <option value="viewer">Viewer (view only)</option>
            <option value="admin">Admin (full access)</option>
          </Select>
        </label>
        <button
          type="submit"
          disabled={inviting}
          className="h-9 rounded-md bg-brand px-3.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {inviting ? "Sending…" : "Send invite"}
        </button>
      </form>
      {msg ? (
        <p className={cn("text-sm", msg.kind === "ok" ? "text-emerald-700" : "text-red-700")}>{msg.text}</p>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 font-medium">Email</th>
              <th className="px-3 py-2 font-medium">Access</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {load.users.length === 0 ? (
              <tr><td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">No members yet.</td></tr>
            ) : (
              load.users.map((u) => (
                <tr key={u.id} className="border-t border-border">
                  <td className="px-3 py-2">{u.email ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                        isAdminRole(u.role) ? "bg-brand/10 text-brand" : "bg-muted text-muted-foreground",
                      )}
                    >
                      {isAdminRole(u.role) ? <ShieldCheck className="size-3" /> : <Eye className="size-3" />}
                      {isAdminRole(u.role) ? "Admin" : "Viewer"}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-semibold",
                        u.status === "accepted" ? "bg-[#d1fae5] text-[#065f46]" : "bg-[#fde68a] text-[#78350f]",
                      )}
                    >
                      {u.status === "accepted" ? "active" : "invited"}
                    </span>
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
