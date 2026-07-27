import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { fetchOrdersSince } from "@/lib/shopify/orders";
import { syncMonthlySales, syncDemand, type ProductRef } from "@/lib/shopify/sales-sync";

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

    const firstOfPrevMonth = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1);
    const since = new Date(Math.min(firstOfPrevMonth, now.getTime() - 31 * 86_400_000)).toISOString();
    const orders = await fetchOrdersSince(since, 300, "id,created_at,cancelled_at,test,line_items,refunds");

    const monthly = await syncMonthlySales(admin, products, orders, now, 2); // prev + current
    const demand = await syncDemand(admin, products, orders, now); // trailing 30d/7d

    return Response.json({
      ok: true,
      now: now.toISOString(),
      since,
      orders: orders.length,
      months: monthly.monthKeys,
      monthly_upserted: monthly.upserted,
      demand,
    });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
