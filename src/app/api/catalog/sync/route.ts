import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerComponentClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { syncCatalog } from "@/lib/shopify/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const FRESH_MS = 15 * 60 * 1000;

// Catalog sync for the add-product picker. GATED — no open access.
//  - Vercel Cron authenticates with the CRON_SECRET bearer (scheduled hourly path).
//  - The "Refresh catalog" button / dropdown-open-when-stale authenticate as an admin
//    session (requireAdmin, app_metadata). Writes go through the service-role client only.
// Self-throttles: pulls Shopify only when the catalog is >15 min stale, unless ?force=1 —
// so the cron, on-open checks, and repeated hits can't hammer the API.
export async function GET(req: Request) {
  const now = new Date();
  const force = new URL(req.url).searchParams.get("force") === "1";
  // Auth: CRON_SECRET bearer (cron) OR an admin session (user-triggered). Never open.
  const secret = process.env.CRON_SECRET;
  const isCron = Boolean(secret) && req.headers.get("authorization") === `Bearer ${secret}`;
  if (!isCron) {
    const gate = await requireAdmin(req);
    if (!gate.ok) return gate.response;
  }
  try {
    const read = await createServerComponentClient();
    const { data } = await read
      .from("shopify_catalog")
      .select("synced_at")
      .order("synced_at", { ascending: false })
      .limit(1);
    const last = data?.[0]?.synced_at ? new Date(data[0].synced_at as string).getTime() : 0;
    const ageMs = now.getTime() - last;
    if (!force && last && ageMs < FRESH_MS) {
      return Response.json({
        ok: true,
        skipped: true,
        reason: "fresh",
        synced_at: new Date(last).toISOString(),
        age_minutes: Math.round(ageMs / 60000),
      });
    }
    const admin = createSupabaseAdminClient();
    const result = await syncCatalog(admin, now);
    return Response.json({ ok: true, synced_at: now.toISOString(), ...result });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
