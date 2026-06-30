import type { SupabaseClient } from "@supabase/supabase-js";
import { getInventoryRowsWith } from "@/lib/data/inventory";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadAlertConfig } from "@/lib/alerts/config";
import { runDispatch } from "@/lib/alerts/dispatch";
import { readActiveRecipients } from "@/lib/alerts/recipients";
import type { PriorFire } from "@/lib/alerts/dedup";
import { readRecomputeInputs, computeAll, persistProjections } from "@/lib/projections/recompute";
import { loadProjectionSettings } from "@/lib/config/projection-config";
import { refreshInventory } from "@/lib/shopify/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 6-hour cron: (0) refresh inventory from Shopify, (a) recompute projections on
// REAL demand, (b) dispatch alerts to the DB recipients. Reads use the service-role
// client when available (required after the RLS cutover) and fall back to anon
// pre-cutover. Protected by Bearer CRON_SECRET. `?dryRun=1` writes/sends nothing.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET; // server-only
  if (!secret) return Response.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const dryRun = new URL(req.url).searchParams.get("dryRun") === "1";
  const now = new Date();
  const hasServiceRole = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  // Reads: service-role if available (survives RLS), else anon (pre-cutover / dry-run).
  const readDb: SupabaseClient = hasServiceRole ? createSupabaseAdminClient() : createSupabaseServerClient();

  try {
    let inventory: Record<string, unknown> = { refreshed: false, note: "dry-run skips inventory write" };
    let admin: SupabaseClient | null = null;

    if (!dryRun) {
      admin = createSupabaseAdminClient(); // writes require service-role
      inventory = { refreshed: true, ...(await refreshInventory(admin, now)) };
    }

    // (a) recompute on real demand, using the admin-editable config + thresholds
    const inputs = await readRecomputeInputs(readDb, now);
    const settings = await loadProjectionSettings(readDb);
    const computed = computeAll(inputs, now, settings.config, settings.thresholdsByCategory);
    const recompute = dryRun
      ? { persisted: false, wouldWrite: computed.length }
      : { persisted: true, written: await persistProjections(admin!, computed, now) };

    // (b) dispatch
    const config = loadAlertConfig();
    const rows = await getInventoryRowsWith(readDb);
    const recipients = hasServiceRole ? await readActiveRecipients(createSupabaseAdminClient()) : [];

    const log = await readDb.from("alert_log").select("product_id, alert_level, fired_at");
    if (log.error) throw new Error(`alert_log read: ${log.error.message}`);
    const alertLogByProduct = new Map<string, PriorFire[]>();
    for (const r of log.data ?? []) {
      const list = alertLogByProduct.get(r.product_id) ?? [];
      list.push({ alert_level: r.alert_level, fired_at: new Date(r.fired_at) });
      alertLogByProduct.set(r.product_id, list);
    }

    const dispatch = await runDispatch({ rows, config, recipients, alertLogByProduct, now, dryRun, admin });

    return Response.json({
      ok: true,
      dryRun,
      now: now.toISOString(),
      inventory,
      recompute,
      config: {
        timezone: config.timezone,
        from: config.from || null,
        dashboardUrl: config.dashboardUrl || null,
        hasResendKey: config.hasResendKey, // presence only
        recipientCount: recipients.length,
      },
      dispatch,
    });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
