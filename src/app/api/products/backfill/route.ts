import { requireAdmin } from "@/lib/auth/require-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Background history backfill for a newly added product (history_status building->ready,
// reusing sales-sync's aggregateSales/syncMonthlySales on a wide window, filtered to the
// new variant). GATED (requireAdmin, app_metadata) — service-role writes only. Body lands
// in Task 4.
export async function POST(req: Request) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.response;
  return Response.json({ error: "not yet implemented" }, { status: 501 });
}
