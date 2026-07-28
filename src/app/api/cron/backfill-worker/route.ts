import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { fetchShopTimeZone } from "@/lib/shopify/shop";
import { runBackfillTick } from "@/lib/shopify/backfill";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // Pro ceiling per the other crons; chunks (~25s) fit even 60s.

// Backfill worker — odd-minute cadence (1-59/2) so it never collides with demand-sync
// (0 */6) or catalog sync (30 * * * *), both of which paginate Shopify orders. Claims OR
// resumes ONE pending/building product per tick and processes month-chunks from its cursor
// until a 270s soft deadline (30s margin under maxDuration 300) or completion. CRON_SECRET
// bearer (Vercel Cron sends it automatically) — not requireAdmin; this is a scheduled job.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET; // server-only
  if (!secret) return Response.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const now = new Date();
  try {
    const admin = createSupabaseAdminClient(); // service-role writes
    const timeZone = await fetchShopTimeZone(); // shop-local month bucketing
    const result = await runBackfillTick(admin, now, timeZone, { leaseMs: 300_000, softDeadlineMs: 270_000 });
    return Response.json({ ok: true, now: now.toISOString(), ...result });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
