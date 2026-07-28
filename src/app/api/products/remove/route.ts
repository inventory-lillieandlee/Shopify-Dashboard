import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Remove a tracked product: sets active=FALSE — NEVER DELETE. alert_log + monthly_sales +
// projections rows are retained (Phase 4 needs alert history). Once active=false the product
// drops from getInventoryRows (active=true) and readRecomputeInputs (active=true) → gone from
// the dashboard and from alerting. OPEN — the dashboard is open (no auth gate); service-role write.
export async function POST(req: Request) {

  const b = (await req.json().catch(() => null)) as { id?: unknown } | null;
  const id = typeof b?.id === "string" ? b.id : null;
  if (!id) return Response.json({ error: "id (product uuid) required" }, { status: 400 });

  try {
    const admin = createSupabaseAdminClient();
    const upd = await admin
      .from("products")
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id, name, active")
      .limit(1);
    if (upd.error) throw new Error(`products update: ${upd.error.message}`);
    if (!upd.data?.length) return Response.json({ error: "product not found" }, { status: 404 });
    return Response.json({ ok: true, product: upd.data[0] });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
