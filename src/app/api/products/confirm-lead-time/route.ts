import { requireAdmin } from "@/lib/auth/require-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Confirm a product's lead time → clears products.lead_time_provisional (and optionally
// sets a corrected lead_time_days). GATED (requireAdmin, app_metadata) — service-role
// writes only. Body lands in Task 8.
export async function POST() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;
  return Response.json({ error: "not yet implemented" }, { status: 501 });
}
