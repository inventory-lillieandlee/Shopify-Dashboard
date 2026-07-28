import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerComponentClient } from "@/lib/supabase/server";
import { syncCatalog } from "@/lib/shopify/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const FRESH_MS = 15 * 60 * 1000;

// Catalog sync for the add-product picker. OPEN — the dashboard is open (no auth gate); the
// Vercel Cron and the "Refresh catalog" button both hit it. Writes go through the service-role
// client only. Self-throttles: pulls Shopify only when the catalog is >15 min stale, unless
// ?force=1 — so the cron, on-open checks, and repeated hits can't hammer the API.
export async function GET(req: Request) {
  const now = new Date();
  const force = new URL(req.url).searchParams.get("force") === "1";
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
