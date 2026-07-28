import { requireAdmin } from "@/lib/auth/require-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Remove a tracked product (sets active=false — never DELETE; alert_log + monthly_sales
// are retained). GATED (requireAdmin, app_metadata) — service-role writes only. Body
// lands in Task 5.
export async function POST(req: Request) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.response;
  return Response.json({ error: "not yet implemented" }, { status: 501 });
}
