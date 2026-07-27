import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { fetchOrdersSince } from "@/lib/shopify/orders";
import { fetchShopTimeZone } from "@/lib/shopify/shop";
import { syncMonthlySales, syncDemand, monthlyRefreshSince, type ProductRef } from "@/lib/shopify/sales-sync";
import { readRecomputeInputs, computeAll, persistProjections } from "@/lib/projections/recompute";
import { loadProjectionSettings } from "@/lib/config/projection-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// High order volume → allow a long pull. Vercel Pro honors up to 300s.
export const maxDuration = 300;

// DAILY cron: ONE Shopify pull feeds BOTH writers.
//  - monthly_sales: recompute + upsert the PREVIOUS and CURRENT month in full every
//    run, so the current-month bar tracks live Shopify within one cron interval and a
//    completed month is never overwritten by a partial one.
//  - sku_demand: computeDemand slices its own trailing 30d/7d out of the same set, so
//    demand math is unchanged (only the shared cancelled/test exclusion applies).
// The pull starts at min(first-of-previous-month, now-31d) so it always covers both the
// full previous month AND the 30-day demand window (guards the month-start edge, where
// first-of-previous-month is fewer than 31 days back).
// After the writes it recomputes projections on the FRESH sku_demand (same engine +
// admin-editable config as recompute-and-alert, minus inventory refresh + alert dispatch)
// so tiers/reorder dates reflect the new demand immediately, not at the next */15 tick.
// Protected by Bearer CRON_SECRET (Vercel Cron sends it automatically).
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET; // server-only
  if (!secret) return Response.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const now = new Date();
  try {
    const admin = createSupabaseAdminClient(); // service-role: upserts
    const { data, error } = await admin.from("products").select("id, shopify_variant_id").eq("active", true);
    if (error) throw new Error(`products: ${error.message}`);
    const products = (data ?? []) as ProductRef[];

    const since = monthlyRefreshSince(now).toISOString();
    const [orders, timeZone] = await Promise.all([
      fetchOrdersSince(since, 300, "id,created_at,cancelled_at,test,line_items,refunds"),
      fetchShopTimeZone(), // shop-local month bucketing
    ]);

    const monthly = await syncMonthlySales(admin, products, orders, now, 2, timeZone); // prev + current
    const demand = await syncDemand(admin, products, orders, now); // trailing 30d/7d

    // Recompute projections now, on the just-written sku_demand + the latest inventory
    // snapshot (refreshed on its own cron). No alert dispatch here — recompute-and-alert
    // owns that; this only removes the up-to-15-min lag before tiers reflect new demand.
    const inputs = await readRecomputeInputs(admin, now);
    const settings = await loadProjectionSettings(admin);
    const computed = computeAll(inputs, now, settings.config, settings.thresholdsByCategory);
    const projections = await persistProjections(admin, computed, now);

    return Response.json({
      ok: true,
      now: now.toISOString(),
      since,
      timeZone,
      orders: orders.length,
      months: monthly.monthKeys,
      monthly_upserted: monthly.upserted,
      demand,
      projections,
    });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
