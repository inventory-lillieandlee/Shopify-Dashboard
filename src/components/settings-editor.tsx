"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { surfacePanel } from "@/lib/surface";
import { CATEGORY_LABELS } from "@/lib/dashboard";
import type { Category } from "@/lib/data/types";

interface CategoryRow {
  category: Category;
  yellow_days: number;
  red_days: number;
  critical_days: number;
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

const numField =
  "h-9 w-24 rounded-md border bg-card px-2 text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-60 disabled:cursor-not-allowed";

export function SettingsEditor() {
  const [data, setData] = useState<ConfigPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings/config", { cache: "no-store" })
      .then(async (r) => (r.ok ? r.json() : Promise.reject(new Error(`Failed (${r.status})`))))
      .then(setData)
      .catch((e) => setErr(String(e.message ?? e)));
  }, []);

  if (err) return <Shell><p className="text-sm text-red-700">{err}</p></Shell>;
  if (!data) return <Shell><p className="text-sm text-muted-foreground">Loading settings…</p></Shell>;

  const { editable } = data;
  const setApp = (k: "growth_pct" | "spike_threshold_pct", v: number) =>
    setData({ ...data, app: { ...data.app, [k]: v } });
  const setCat = (i: number, k: keyof CategoryRow, v: number) =>
    setData({ ...data, categories: data.categories.map((c, j) => (j === i ? { ...c, [k]: v } : c)) });
  const setSku = (i: number, k: "lead_time_days" | "safety_stock_days", v: number) =>
    setData({ ...data, skus: data.skus.map((s, j) => (j === i ? { ...s, [k]: v } : s)) });

  async function save() {
    setSaving(true);
    setMsg(null);
    setErr(null);
    const res = await fetch("/api/settings/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        growth_pct: data!.app.growth_pct,
        spike_threshold_pct: data!.app.spike_threshold_pct,
        categories: data!.categories,
        skus: data!.skus.map((s) => ({ id: s.id, lead_time_days: s.lead_time_days, safety_stock_days: s.safety_stock_days })),
      }),
    });
    setSaving(false);
    if (res.ok) {
      const j = (await res.json()) as { recomputed?: number };
      setMsg(`Saved — recomputed ${j.recomputed ?? 0} SKUs. Dashboard updated.`);
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

      {/* Global */}
      <Shell>
        <Head title="Global projection settings" sub="Applied across every SKU." />
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

      {/* Per-category tier cutoffs */}
      <Shell>
        <Head title="Alert tiers — days of stock" sub="How many days of stock remaining moves a SKU into each tier, per category." />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground [&>th]:px-2 [&>th]:py-2">
                <th>Category</th><th>Yellow ≤</th><th>Red ≤</th><th>Critical ≤</th>
              </tr>
            </thead>
            <tbody>
              {data.categories.map((c, i) => (
                <tr key={c.category} className="border-t border-border [&>td]:px-2 [&>td]:py-2">
                  <td className="font-medium">{CATEGORY_LABELS[c.category] ?? c.category}</td>
                  {(["yellow_days", "red_days", "critical_days"] as const).map((k) => (
                    <td key={k}>
                      <input type="number" min={0} disabled={!editable} value={c[k]}
                        onChange={(e) => setCat(i, k, Number(e.target.value))} className={numField} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">Must stay ordered: yellow ≥ red ≥ critical.</p>
      </Shell>

      {/* Per-SKU lead time + safety stock */}
      <Shell>
        <Head title="Per-SKU lead time & safety stock" sub="Drives each SKU's reorder date." />
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

      {editable && (
        <div className="flex items-center gap-3">
          <button type="button" onClick={save} disabled={saving}
            className="h-10 rounded-md bg-brand px-4 font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50">
            {saving ? "Saving…" : "Save & recompute"}
          </button>
          {msg ? <span className="text-sm text-emerald-700">{msg}</span> : null}
          {err ? <span className="text-sm text-red-700">{err}</span> : null}
        </div>
      )}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <section className={cn(surfacePanel, "space-y-4 p-5")}>{children}</section>;
}
function Head({ title, sub }: { title: string; sub: string }) {
  return (
    <div>
      <h2 className="font-display text-lg font-semibold text-brand">{title}</h2>
      <p className="text-sm text-muted-foreground">{sub}</p>
    </div>
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
