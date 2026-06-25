import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getInventoryRows } from "@/lib/data/inventory";
import { DemoBanner } from "@/components/demo-banner";
import { SkuDetail } from "@/components/sku-detail";

// Live data, always fresh — same posture as the dashboard.
export const dynamic = "force-dynamic";

// IMPORTANT: this route reads through THE SAME data-access seam as the dashboard
// (getInventoryRows) and just picks the one row by shopify_product_id. No second
// Supabase read path is introduced — the seam stays the single source.
export default async function SkuPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const rows = await getInventoryRows();
  const row = rows.find((r) => r.shopifyProductId === id);
  if (!row) notFound();

  return (
    <div className="min-h-screen">
      <DemoBanner />
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back to dashboard
        </Link>
        <SkuDetail row={row} />
      </main>
    </div>
  );
}
