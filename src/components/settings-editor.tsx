"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { surfacePanel } from "@/lib/surface";
import { CATEGORY_LABELS } from "@/lib/dashboard";
import type { Category } from "@/lib/data/types";

type Tier = "yellow" | "red" | "critical";
interface CategoryRow {
  category: Category;
  yellow_days: number;
  red_days: number;
  critical_days: number;
  yellow_enabled: boolean;
  red_enabled: boolean;
  critical_enabled: boolean;
}
interface SkuRow {
  id: string;
  name: string;
  category: Category;
  lead_time_days: number;
  safety_stock_days: number;
}
interface ConfigPayload {
  editable: boolean;
  app: { growth_pct: number; spike_threshold_pct: number };
  categories: CategoryRow[];
  skus: SkuRow[];
}

const DAY_COL: Record<Tier, "yellow_days" | "red_days" | "critical_days"> = {
  yellow: "yellow_days",
  red: "red_days",
  critical: "critical_days",
};
const EN_COL: Record<Tier, "yellow_enabled" | "red_enabled" | "critical_enabled"> = {
  yellow: "yellow_enabled",
  red: "red_enabled",
  critical: "critical_enabled",
};
const TIER_LABEL: Record<Tier, string> = { yellow: "Yellow ≤", red: "Red ≤", critical: "Critical ≤" };
const numField =
  "h-9 w-20 rounded-md border bg-card px-2 text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-60 disabled:cursor-not-allowed";
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function SettingsEditor() {
  const [data, setData] = useState<ConfigPayload | null>(null);
  const [base, setBase] = useState<ConfigPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings/config", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Failed (${r.status})`))))
      .then((d: ConfigPayload) => {
        setData(d);
        setBase(structuredClone(d));
      })
      .catch((e) => setErr(String(e.message ?? e)));
  }, []);

  if (err) return <Shell><p className="text-sm text-red-700">{err}</p></Shell>;
  if (!data || !base) return <Shell><p className="text-sm text-muted-foreground">Loading settings…</p></Shell>;

  const { editable } = data;
  const setApp = (k: "growth_pct" | "spike_threshold_pct", v: number) =>
    setData({ ...data, app: { ...data.app, [k]: v } });
  const setCat = (i: number, patch: Partial<CategoryRow>) =>
    setData({ ...data, categories: data.categories.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const setSku = (i: number, k: "lead_time_days" | "safety_stock_days", v: number) =>
    setData({ ...data, skus: data.skus.map((s, j) => (j === i ? { ...s, [k]: v } : s)) });
  // Tier toggles live in the column header and apply to every category at once.
  const tierAllOn = (tier: Tier) => data.categories.every((c) => c[EN_COL[tier]]);
  const setTierAll = (tier: Tier, value: boolean) =>
    setData({ ...data, categories: data.categories.map((c) => ({ ...c, [EN_COL[tier]]: value })) });

  const dirtyGlobal = !eq(data.app, base.app);
  const dirtyTiers = !eq(data.categories, base.categories);
  const dirtySkus = !eq(data.skus, base.skus);

  async function save(section: "global" | "tiers" | "skus") {
    setBusy(section);
    setDone(null);
    setErr(null);
    const payload =
      section === "global"
        ? { growth_pct: data!.app.growth_pct, spike_threshold_pct: data!.app.spike_threshold_pct }
        : section === "tiers"
          ? { categories: data!.categories }
          : { skus: data!.skus.map((s) => ({ id: s.id, lead_time_days: s.lead_time_days, safety_stock_days: s.safety_stock_days })) };
    const res = await fetch("/api/settings/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setBusy(null);
    if (res.ok) {
      const j = (await res.json()) as { recomputed?: number };
      // clear this section's dirty by snapshotting it into the baseline
      setBase((prev) =>
        prev
          ? {
              ...prev,
              app: section === "global" ? structuredClone(data!.app) : prev.app,
              categories: section === "tiers" ? structuredClone(data!.categories) : prev.categories,
              skus: section === "skus" ? structuredClone(data!.skus) : prev.skus,
            }
          : prev,
      );
      setDone(`${section} saved — recomputed ${j.recomputed ?? 0} SKUs.`);
    } else {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setErr(j.error ? `Save failed: ${j.error}` : "Save failed.");
    }
  }

  return (
    <div className="animate-in space-y-6 duration-500 fade-in slide-in-from-bottom-2">
      {!editable && (
        <p className="rounded-lg border border-border bg-muted/50 px-4 py-2 text-sm text-muted-foreground">
          Read-only — sign in as an admin to edit these settings.
        </p>
      )}
      {done && <p className="text-sm text-emerald-700">{done}</p>}
      {err && <p className="text-sm text-red-700">{err}</p>}

      {/* Global */}
      <Shell>
        <Head title="Global projection settings" sub="Applied across every SKU.">
          {editable && dirtyGlobal && <SaveBtn onClick={() => save("global")} busy={busy === "global"} />}
        </Head>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Baseline growth" hint="% month-over-month uplift on demand">
            <input type="number" step="0.5" min={0} max={100} disabled={!editable} value={data.app.growth_pct}
              onChange={(e) => setApp("growth_pct", Number(e.target.value))} className={numField} /> <span className="text-sm text-muted-foreground">%</span>
          </Field>
          <Field label="Demand-spike threshold" hint="flag a SKU when 7-day demand exceeds plan by this much">
            <input type="number" step="1" min={0} max={100} disabled={!editable} value={data.app.spike_threshold_pct}
              onChange={(e) => setApp("spike_threshold_pct", Number(e.target.value))} className={numField} /> <span className="text-sm text-muted-foreground">%</span>
          </Field>
        </div>
      </Shell>

      {/* Per-category tier cutoffs + per-tier alert toggles */}
      <Shell>
        <Head title="Alert tiers — days of stock" sub="Days of stock remaining for each tier, per category. Each column's header toggle turns that tier's email alerts on or off across all categories (the dashboard still shows the tier either way).">
          {editable && dirtyTiers && <SaveBtn onClick={() => save("tiers")} busy={busy === "tiers"} />}
        </Head>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground [&>th]:px-2 [&>th]:py-2 [&>th]:align-bottom">
                <th>Category</th>
                {(["yellow", "red", "critical"] as Tier[]).map((tier) => (
                  <th key={tier}>
                    <div className="flex items-center gap-2">
                      <span>{TIER_LABEL[tier]}</span>
                      <Toggle
                        on={tierAllOn(tier)}
                        disabled={!editable}
                        label={`${tier} email alerts for all categories`}
                        onChange={(v) => setTierAll(tier, v)}
                      />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.categories.map((c, i) => (
                <tr key={c.category} className="border-t border-border [&>td]:px-2 [&>td]:py-2">
                  <td className="font-medium">{CATEGORY_LABELS[c.category] ?? c.category}</td>
                  {(["yellow", "red", "critical"] as Tier[]).map((tier) => (
                    <td key={tier}>
                      <input
                        type="number"
                        min={0}
                        disabled={!editable}
                        value={c[DAY_COL[tier]]}
                        onChange={(e) => setCat(i, { [DAY_COL[tier]]: Number(e.target.value) } as Partial<CategoryRow>)}
                        className={cn(numField, !tierAllOn(tier) && "opacity-60")}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">Must stay ordered: yellow ≥ red ≥ critical. A muted tier (header toggle off) still shows on the dashboard — it just won't email.</p>
      </Shell>

      {/* Per-SKU lead time + safety stock */}
      <Shell>
        <Head title="Per-SKU lead time & safety stock" sub="Drives each SKU's reorder date.">
          {editable && dirtySkus && <SaveBtn onClick={() => save("skus")} busy={busy === "skus"} />}
        </Head>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground [&>th]:px-2 [&>th]:py-2">
                <th>Product</th><th>Category</th><th>Lead time (days)</th><th>Safety stock (days)</th>
              </tr>
            </thead>
            <tbody>
              {data.skus.map((s, i) => (
                <tr key={s.id} className="border-t border-border [&>td]:px-2 [&>td]:py-2">
                  <td className="font-medium">{s.name}</td>
                  <td className="text-muted-foreground">{CATEGORY_LABELS[s.category] ?? s.category}</td>
                  <td><input type="number" min={1} max={365} disabled={!editable} value={s.lead_time_days}
                    onChange={(e) => setSku(i, "lead_time_days", Number(e.target.value))} className={numField} /></td>
                  <td><input type="number" min={0} max={365} disabled={!editable} value={s.safety_stock_days}
                    onChange={(e) => setSku(i, "safety_stock_days", Number(e.target.value))} className={numField} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Shell>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <section className={cn(surfacePanel, "space-y-4 p-5")}>{children}</section>;
}
function Head({ title, sub, children }: { title: string; sub: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="font-display text-lg font-semibold text-brand">{title}</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">{sub}</p>
      </div>
      {children}
    </div>
  );
}
function SaveBtn({ onClick, busy }: { onClick: () => void; busy: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={busy}
      className="h-9 shrink-0 rounded-md bg-brand px-3.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50">
      {busy ? "Saving…" : "Save & recompute"}
    </button>
  );
}
function Field({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-muted/40 p-3">
      <div className="text-xs tracking-wide text-muted-foreground uppercase">{label}</div>
      <div className="mt-1 flex items-center gap-1">{children}</div>
      <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
    </div>
  );
}
function Toggle({ on, disabled, onChange, label }: { on: boolean; disabled: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled}
      onClick={() => onChange(!on)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50",
        on ? "bg-brand" : "bg-muted-foreground/30",
      )}>
      <span className={cn("inline-block size-4 rounded-full bg-white shadow transition-transform", on ? "translate-x-4" : "translate-x-0.5")} />
    </button>
  );
}
