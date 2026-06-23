import { getInventoryRows } from "@/lib/data/inventory";
import {
  deriveSummary,
  reorderQueue,
  sortRows,
  type SortDir,
  type SortKey,
} from "@/lib/dashboard";
import { CATEGORIES, type AlertLevel, type Category } from "@/lib/data/types";
import { cn } from "@/lib/utils";
import { surfacePanel } from "@/lib/surface";
import { DemoBanner } from "@/components/demo-banner";
import { SiteHeader } from "@/components/site-header";
import { SummaryCards } from "@/components/summary-cards";
import { TableControls } from "@/components/table-controls";
import { InventoryTable } from "@/components/inventory-table";
import { ReorderQueue } from "@/components/reorder-queue";

// Live data from Supabase — always render fresh (no static caching).
export const dynamic = "force-dynamic";

const SORT_KEYS = new Set<SortKey>(["dsr", "units", "name"]);
const ALERT_LEVELS = new Set<AlertLevel>(["ok", "yellow", "red", "critical"]);

type SearchParams = Record<string, string | string[] | undefined>;

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const pick = (v: string | string[] | undefined) =>
    typeof v === "string" ? v : undefined;

  const rawCategory = pick(sp.category);
  const rawAlert = pick(sp.alert);
  const rawSort = pick(sp.sort);

  const category =
    rawCategory && (CATEGORIES as readonly string[]).includes(rawCategory)
      ? (rawCategory as Category)
      : undefined;
  const alert =
    rawAlert && ALERT_LEVELS.has(rawAlert as AlertLevel)
      ? (rawAlert as AlertLevel)
      : undefined;
  const sort: SortKey =
    rawSort && SORT_KEYS.has(rawSort as SortKey) ? (rawSort as SortKey) : "dsr";
  const dir: SortDir = pick(sp.dir) === "desc" ? "desc" : "asc";

  const all = await getInventoryRows();
  const summary = deriveSummary(all);
  const queue = reorderQueue(all);

  let rows = all;
  if (category) rows = rows.filter((r) => r.category === category);
  if (alert) rows = rows.filter((r) => r.alertLevel === alert);
  rows = sortRows(rows, sort, dir);

  return (
    <div className="min-h-screen">
      <DemoBanner />
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
        <SiteHeader />

        <SummaryCards summary={summary} />

        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3 px-1">
            <div>
              <h2 className="font-display text-lg font-semibold text-brand">
                Inventory
              </h2>
              <p className="text-sm text-muted-foreground">
                {rows.length} of {all.length} SKUs
                {category || alert ? " (filtered)" : ""}
              </p>
            </div>
            <TableControls
              category={category}
              alert={alert}
              sort={sort}
              dir={dir}
            />
          </div>
          <div
            className={cn(
              surfacePanel,
              "animate-in overflow-hidden duration-500 fade-in slide-in-from-bottom-2",
            )}
          >
            <InventoryTable rows={rows} sort={sort} dir={dir} />
          </div>
        </section>

        <ReorderQueue rows={queue} />

        <footer className="pt-2 text-center text-xs text-muted-foreground">
          Lillie &amp; Lee · Phase 1 dashboard shell · reading live from Supabase
          (demo data)
        </footer>
      </main>
    </div>
  );
}
