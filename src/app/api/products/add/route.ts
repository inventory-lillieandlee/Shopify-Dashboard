import { requireAdmin } from "@/lib/auth/require-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Add a tracked product from the catalog. GATED (requireAdmin, app_metadata) — service-
// role writes only, no open access. Body (category pick, provisional lead from
// category_thresholds, history_status='pending', multi-variant reject, enqueue backfill)
// lands in Task 3/6.
export async function POST() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;
  return Response.json({ error: "not yet implemented" }, { status: 501 });
}
