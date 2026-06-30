import type { NextRequest } from "next/server";
import { requireAdmin, getSessionUser } from "@/lib/auth/require-admin";
import { isAdmin } from "@/lib/auth/policy";
import { createServerComponentClient } from "@/lib/supabase/server";
import { readRecomputeInputs, computeAll, persistProjections } from "@/lib/projections/recompute";
import { loadProjectionSettings } from "@/lib/config/projection-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CATS = new Set(["supplement_chews", "cbd", "treats", "salmon_oil"]);
const numIn = (v: unknown, lo: number, hi: number): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
const intIn = (v: unknown, lo: number, hi: number): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;

// GET is public (config isn't secret; these tables are anon/authenticated-readable).
// `editable` tells the UI whether to show inputs as editable (admin) or read-only.
export async function GET() {
  try {
    const supabase = await createServerComponentClient();
    const user = await getSessionUser();
    const [app, cats, prods] = await Promise.all([
      supabase.from("app_config").select("growth_pct, spike_threshold_pct").maybeSingle(),
      supabase
        .from("category_thresholds")
        .select("category, yellow_days, red_days, critical_days, yellow_enabled, red_enabled, critical_enabled")
        .order("category"),
      supabase
        .from("products")
        .select("id, name, category, lead_time_days, safety_stock_days")
        .eq("active", true)
        .order("name"),
    ]);
    return Response.json({
      editable: isAdmin(user),
      app: app.data ?? { growth_pct: 8, spike_threshold_pct: 15 },
      categories: cats.data ?? [],
      skus: prods.data ?? [],
    });
  } catch (e) {
    console.warn("config GET failed:", String(e));
    return Response.json({ error: "could not load settings" }, { status: 500 });
  }
}

// PATCH is ADMIN-ONLY. Validates, writes, then recomputes so the dashboard reflects
// the new knobs immediately.
export async function PATCH(req: NextRequest) {
  const { admin, error } = await requireAdmin();
  if (error) return error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  const b = body as {
    growth_pct?: unknown;
    spike_threshold_pct?: unknown;
    categories?: {
      category: string;
      yellow_days: number;
      red_days: number;
      critical_days: number;
      yellow_enabled?: boolean;
      red_enabled?: boolean;
      critical_enabled?: boolean;
    }[];
    skus?: { id: string; lead_time_days: number; safety_stock_days: number }[];
  };

  try {
    // global
    const appPatch: Record<string, number> = {};
    if (b.growth_pct !== undefined) {
      if (!numIn(b.growth_pct, 0, 100)) return Response.json({ error: "growth_pct 0–100" }, { status: 400 });
      appPatch.growth_pct = b.growth_pct;
    }
    if (b.spike_threshold_pct !== undefined) {
      if (!numIn(b.spike_threshold_pct, 0, 100)) return Response.json({ error: "spike_threshold_pct 0–100" }, { status: 400 });
      appPatch.spike_threshold_pct = b.spike_threshold_pct;
    }
    if (Object.keys(appPatch).length) {
      const { error: e } = await admin.from("app_config").update(appPatch).eq("id", true);
      if (e) throw new Error(e.message);
    }

    // per-category thresholds
    for (const c of b.categories ?? []) {
      if (!CATS.has(c.category)) return Response.json({ error: `bad category ${c.category}` }, { status: 400 });
      if (![c.yellow_days, c.red_days, c.critical_days].every((x) => intIn(x, 0, 100000)))
        return Response.json({ error: "threshold days must be whole numbers" }, { status: 400 });
      if (!(c.yellow_days >= c.red_days && c.red_days >= c.critical_days))
        return Response.json({ error: "must be yellow ≥ red ≥ critical" }, { status: 400 });
      const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
      const { error: e } = await admin
        .from("category_thresholds")
        .update({
          yellow_days: c.yellow_days,
          red_days: c.red_days,
          critical_days: c.critical_days,
          yellow_enabled: bool(c.yellow_enabled, true),
          red_enabled: bool(c.red_enabled, true),
          critical_enabled: bool(c.critical_enabled, true),
        })
        .eq("category", c.category);
      if (e) throw new Error(e.message);
    }

    // per-SKU lead time + safety stock
    for (const s of b.skus ?? []) {
      if (typeof s.id !== "string") return Response.json({ error: "bad sku id" }, { status: 400 });
      if (!intIn(s.lead_time_days, 1, 365) || !intIn(s.safety_stock_days, 0, 365))
        return Response.json({ error: "lead 1–365, safety 0–365 (whole days)" }, { status: 400 });
      const { error: e } = await admin
        .from("products")
        .update({ lead_time_days: s.lead_time_days, safety_stock_days: s.safety_stock_days })
        .eq("id", s.id);
      if (e) throw new Error(e.message);
    }

    // recompute with the new settings so projections/tiers update right away
    const now = new Date();
    const inputs = await readRecomputeInputs(admin, now);
    const settings = await loadProjectionSettings(admin);
    const computed = computeAll(inputs, now, settings.config, settings.thresholdsByCategory);
    const recomputed = await persistProjections(admin, computed, now);

    return Response.json({ ok: true, recomputed });
  } catch (e) {
    console.warn("config PATCH failed:", String(e));
    return Response.json({ error: "could not save settings" }, { status: 500 });
  }
}
