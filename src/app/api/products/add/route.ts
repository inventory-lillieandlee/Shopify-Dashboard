import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { isTrackableCategory, isMultiVariant, resolveAutoActivate, monthlySalesIsCurrent } from "@/lib/products/rules";
import { monthIndex, monthKeyFromIndex, shopMonth } from "@/lib/shopify/backfill";
import { fetchShopTimeZone } from "@/lib/shopify/shop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Add a tracked product from the catalog. GATED (requireAdmin), service-role write.
// Inserts active=FALSE + history_status='pending' (the backfill-worker cron picks it up —
// NO inline backfill, NO fire-and-forget), lead_time_provisional=true, and lead/safety READ
// from category_thresholds for the operator-picked category (never hardcoded). Re-adding a
// previously removed product UPDATES the existing row (matched on shopify_variant_id) —
// never a duplicate. RE-ADD BACKFILL POLICY: reuse the retained monthly_sales when it is
// still current (newest stored month is the current OR previous month) — start the worker's
// cursor at the PREVIOUS shop-local month so it walks prev -> current -> demand through the
// existing chunk loop (two bounded month pulls; refreshes the recent months + sku_demand),
// never re-pulling the dense historical months; otherwise re-enqueue a full sweep like a
// fresh add. Multi-variant products are rejected. `auto_activate` defaults true (real add →
// appears when ready); the verification run passes false to bound exposure.
export async function POST(req: Request) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  const b = body as { variant_id?: unknown; category?: unknown; auto_activate?: unknown };
  const variantId = typeof b.variant_id === "number" ? b.variant_id : Number(b.variant_id);
  if (!Number.isFinite(variantId) || variantId <= 0) {
    return Response.json({ error: "variant_id (number) required" }, { status: 400 });
  }
  const category = String(b.category ?? "");
  if (!isTrackableCategory(category)) {
    return Response.json(
      { error: "category must be one of supplement_chews, cbd, treats, salmon_oil (explicit pick required — never inferred from the title)" },
      { status: 400 },
    );
  }
  const autoActivate = resolveAutoActivate(b.auto_activate);

  try {
    const admin = createSupabaseAdminClient();

    // catalog entry — source of truth for title / product id / inventory item / variant count.
    const cat = await admin
      .from("shopify_catalog")
      .select("shopify_product_id, inventory_item_id, title, variant_count")
      .eq("variant_id", variantId)
      .limit(1);
    if (cat.error) throw new Error(`catalog: ${cat.error.message}`);
    const entry = cat.data?.[0] as
      | { shopify_product_id: number; inventory_item_id: number | null; title: string; variant_count: number }
      | undefined;
    if (!entry) {
      return Response.json({ error: "variant not found in catalog — refresh the catalog and retry" }, { status: 404 });
    }
    if (isMultiVariant(entry.variant_count ?? 1)) {
      return Response.json(
        { error: `This product has ${entry.variant_count} variants; the dashboard tracks single-variant SKUs — not yet supported.` },
        { status: 409 },
      );
    }

    // category defaults — read at ADD TIME ONLY (per-SKU products.* stays authoritative).
    const ct = await admin
      .from("category_thresholds")
      .select("lead_time_days, safety_stock_days")
      .eq("category", category)
      .limit(1);
    if (ct.error) throw new Error(`category_thresholds: ${ct.error.message}`);
    const lead = (ct.data?.[0]?.lead_time_days as number | null | undefined) ?? null;
    const safety = (ct.data?.[0]?.safety_stock_days as number | null | undefined) ?? 30;
    if (lead == null) {
      return Response.json({ error: `no default lead_time_days for category ${category}` }, { status: 500 });
    }

    const base = {
      shopify_product_id: entry.shopify_product_id,
      shopify_variant_id: variantId,
      inventory_item_id: entry.inventory_item_id,
      name: entry.title,
      category,
      lead_time_days: lead,
      safety_stock_days: safety,
      active: false,
      lead_time_provisional: true,
      history_auto_activate: autoActivate,
      history_lease_until: null,
      history_error: null,
      history_attempts: 0,
    };

    // Re-add matches on shopify_variant_id (active true OR false) → UPDATE, never duplicate.
    const existing = await admin.from("products").select("id").eq("shopify_variant_id", variantId).limit(1);
    if (existing.error) throw new Error(`products lookup: ${existing.error.message}`);
    const existingId = existing.data?.[0]?.id as string | undefined;

    // Backfill lifecycle. Fresh add → full sweep (history_status='pending'; the worker sets
    // cursor/target/floor at claim). Re-add → REUSE the retained history when its newest month
    // is current-or-previous: start the cursor at the PREVIOUS month so the worker walks
    // prev → current → demand (two bounded pulls; refreshes the recent months + sku_demand,
    // leaves the dense historical months untouched). Stale → fall through to a full re-enqueue.
    let lifecycle: { history_status: string; history_cursor: string | null; history_target_month: string | null } = {
      history_status: "pending",
      history_cursor: null,
      history_target_month: null,
    };
    let reused = false;
    if (existingId) {
      const tz = await fetchShopTimeZone();
      const currentMonth = shopMonth(new Date(), tz);
      const previousMonth = monthKeyFromIndex(monthIndex(currentMonth) - 1);
      const newest = await admin
        .from("monthly_sales")
        .select("month")
        .eq("product_id", existingId)
        .order("month", { ascending: false })
        .limit(1);
      if (newest.error) throw new Error(`monthly_sales lookup: ${newest.error.message}`);
      const newestMonth = newest.data?.[0]?.month ? String(newest.data[0].month).slice(0, 7) : null;
      if (monthlySalesIsCurrent(newestMonth, previousMonth)) {
        lifecycle = { history_status: "building", history_cursor: previousMonth, history_target_month: currentMonth };
        reused = true;
      }
    }
    const fields = { ...base, ...lifecycle };

    let productId: string;
    let action: "inserted" | "reactivated";
    if (existingId) {
      const upd = await admin
        .from("products")
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq("id", existingId)
        .select("id")
        .single();
      if (upd.error) throw new Error(`products update: ${upd.error.message}`);
      productId = existingId;
      action = "reactivated";
    } else {
      const ins = await admin.from("products").insert(fields).select("id").single();
      if (ins.error) throw new Error(`products insert: ${ins.error.message}`);
      productId = ins.data.id as string;
      action = "inserted";
    }

    return Response.json({
      ok: true,
      action,
      product: {
        id: productId,
        name: entry.title,
        category,
        lead_time_days: lead,
        safety_stock_days: safety,
        active: false,
        history_status: lifecycle.history_status,
        lead_time_provisional: true,
        auto_activate: autoActivate,
      },
      reused,
      note:
        (reused
          ? "re-add: reusing retained history — refreshing recent months + demand (no full backfill)"
          : "queued for full history backfill; the backfill-worker cron builds monthly_sales then sets ready") +
        (autoActivate ? " + active." : " (auto_activate=false → stays inactive)."),
    });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
