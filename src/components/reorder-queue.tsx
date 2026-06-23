import { CalendarClock } from "lucide-react";
import { AlertBadge } from "@/components/alert-badge";
import { cn } from "@/lib/utils";
import { glassPanel } from "@/lib/glass";
import type { InventoryRow } from "@/lib/data/types";
import { CATEGORY_LABELS, daysUntil } from "@/lib/dashboard";
import { formatNumber } from "@/lib/format";

export function ReorderQueue({ rows }: { rows: InventoryRow[] }) {
  // One frosted-glass panel for the whole section; the inner SKU cards are
  // translucent-but-NOT-blurred (we blur the container, not every child).
  return (
    <section className={cn(glassPanel, "space-y-3 p-5")}>
      <div className="flex items-center gap-2">
        <CalendarClock className="size-4 text-muted-foreground" />
        <h2 className="text-base font-semibold">Reorder Queue</h2>
        <span className="text-sm text-muted-foreground">
          overdue or due within 14 days · {rows.length}
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-white/50 bg-white/40 p-6 text-sm text-muted-foreground dark:border-white/10 dark:bg-white/5">
          Nothing to reorder in the next 14 days.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((r) => {
            const d = daysUntil(r.reorderDate) ?? 0;
            const overdue = d < 0;
            return (
              <div
                key={r.productId}
                className={cn(
                  "rounded-xl border bg-white/45 p-4 shadow-sm dark:bg-white/[0.05]",
                  overdue
                    ? "border-red-300/70 dark:border-red-500/30"
                    : "border-amber-300/60 dark:border-amber-500/25",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium" title={r.name}>
                      {r.name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {CATEGORY_LABELS[r.category]}
                    </div>
                  </div>
                  <AlertBadge level={r.alertLevel} />
                </div>
                <div className="mt-3 flex items-center justify-between text-sm">
                  <span
                    className={cn(
                      "font-semibold",
                      overdue ? "text-red-700" : "text-amber-800",
                    )}
                  >
                    {overdue
                      ? `${Math.abs(d)}d overdue`
                      : d === 0
                        ? "Due today"
                        : `Due in ${d}d`}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {formatNumber(r.currentUnits)} u · {formatNumber(r.daysOfStockRemaining)}d DSR
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
