import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { readRecomputeInputs, computeAll, persistProjections } from "@/lib/projections/recompute";
import { loadProjectionSettings } from "@/lib/config/projection-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Confirm a product's lead time → clears lead_time_provisional (and optionally sets a
// corrected lead_time_days), then recomputes projections so the tier reflects the confirmed
// value immediately (and the provisional-alert annotation stops). GATED (requireAdmin),
// service-role write. Deliberately NOT routed through /api/settings/config.
export async function POST(req: Request) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.response;

  const b = (await req.json().catch(() => null)) as { id?: unknown; lead_time_days?: unknown } | null;
  const id = typeof b?.id === "string" ? b.id : null;
  if (!id) return Response.json({ error: "id (product uuid) required" }, { status: 400 });

  const patch: { lead_time_provisional: false; updated_at: string; lead_time_days?: number } = {
    lead_time_provisional: false,
    updated_at: new Date().toISOString(),
  };
  if (b?.lead_time_days !== undefined) {
    const n = Number(b.lead_time_days);
    if (!Number.isInteger(n) || n < 1 || n > 365) {
      return Response.json({ error: "lead_time_days must be a whole number 1–365" }, { status: 400 });
    }
    patch.lead_time_days = n;
  }

  try {
    const admin = createSupabaseAdminClient();
    const upd = await admin
      .from("products")
      .update(patch)
      .eq("id", id)
      .select("id, lead_time_days, lead_time_provisional")
      .limit(1);
    if (upd.error) throw new Error(`products update: ${upd.error.message}`);
    if (!upd.data?.length) return Response.json({ error: "product not found" }, { status: 404 });

    // Recompute so the dashboard tier reflects the confirmed lead time now.
    const now = new Date();
    const inputs = await readRecomputeInputs(admin, now);
    const settings = await loadProjectionSettings(admin);
    const computed = computeAll(inputs, now, settings.config, settings.thresholdsByCategory);
    const recomputed = await persistProjections(admin, computed, now);

    return Response.json({ ok: true, product: upd.data[0], recomputed });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
