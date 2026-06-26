import { getInventoryRows } from "@/lib/data/inventory";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadAlertConfig } from "@/lib/alerts/config";
import { runDispatch } from "@/lib/alerts/dispatch";
import type { PriorFire } from "@/lib/alerts/dedup";
import { readRecomputeInputs, computeAll, persistProjections } from "@/lib/projections/recompute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 6-hour cron: (a) recompute + persist projections, then (b) dispatch alerts.
// Protected by a Bearer CRON_SECRET (Vercel Cron sends this automatically when
// CRON_SECRET is set). `?dryRun=1` does everything EXCEPT the projections write,
// the Resend send, and the alert_log write — it returns exactly what WOULD happen.
export async function GET(req: Request) {
  // ── auth ──
  const secret = process.env.CRON_SECRET; // server-only secret
  const auth = req.headers.get("authorization");
  if (!secret) {
    return Response.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (auth !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const dryRun = new URL(req.url).searchParams.get("dryRun") === "1";
  const now = new Date();
  const anon = createSupabaseServerClient(); // reads only (RLS anon)

  try {
    // ── step a: recompute projections ──
    const inputs = await readRecomputeInputs(anon, now);
    const computed = computeAll(inputs, now);
    let recompute: Record<string, unknown>;
    if (dryRun) {
      recompute = { persisted: false, wouldWrite: computed.length };
    } else {
      const admin = createSupabaseAdminClient(); // service-role: projections upsert
      const written = await persistProjections(admin, computed, now);
      recompute = { persisted: true, written };
    }

    // ── step b: dispatch alerts (reads fresh rows via the anon seam) ──
    const config = loadAlertConfig();
    const rows = await getInventoryRows();

    const log = await anon.from("alert_log").select("product_id, alert_level, fired_at");
    if (log.error) throw new Error(`alert_log read: ${log.error.message}`);
    const alertLogByProduct = new Map<string, PriorFire[]>();
    for (const r of log.data ?? []) {
      const list = alertLogByProduct.get(r.product_id) ?? [];
      list.push({ alert_level: r.alert_level, fired_at: new Date(r.fired_at) });
      alertLogByProduct.set(r.product_id, list);
    }

    const admin = dryRun ? null : createSupabaseAdminClient(); // service-role: alert_log insert
    const dispatch = await runDispatch({ rows, config, alertLogByProduct, now, dryRun, admin });

    return Response.json({
      ok: true,
      dryRun,
      now: now.toISOString(),
      config: {
        minLevel: config.minLevel,
        timezone: config.timezone,
        recipientCount: config.recipients.length,
        recipients: config.recipients,
        from: config.from || null,
        dashboardUrl: config.dashboardUrl || null,
        hasResendKey: config.hasResendKey, // presence only — never the value
      },
      recompute,
      dispatch,
    });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
