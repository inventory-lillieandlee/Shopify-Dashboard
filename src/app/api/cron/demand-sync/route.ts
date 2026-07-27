import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { fetchOrdersSince } from "@/lib/shopify/orders";
import { syncDemand, type ProductRef } from "@/lib/shopify/sales-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// High order volume (~6k/30d) → allow a long pull. Vercel Pro honors up to 300s.
export const maxDuration = 300;

// DAILY cron: pull the last 30 days of Shopify orders, compute real net units sold
// per SKU, and upsert sku_demand (service-role) via the SHARED writer — one code path
// with the backfill (cancelled + test excluded, refunds netted). Heavy → off the 6h
// hot path. Protected by Bearer CRON_SECRET (Vercel Cron sends it automatically).
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET; // server-only
  if (!secret) return Response.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const now = new Date();
  try {
    const admin = createSupabaseAdminClient(); // service-role: sku_demand upsert
    const { data, error } = await admin.from("products").select("id, shopify_variant_id").eq("active", true);
    if (error) throw new Error(`products: ${error.message}`);
    const products = (data ?? []) as ProductRef[];

    const since = new Date(now.getTime() - 30 * 86_400_000).toISOString();
    const orders = await fetchOrdersSince(since, 200, "id,created_at,cancelled_at,test,line_items,refunds");
    const demand = await syncDemand(admin, products, orders, now);

    return Response.json({ ok: true, now: now.toISOString(), orders: orders.length, demand });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
