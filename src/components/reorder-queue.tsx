import { CalendarClock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { AlertBadge } from "@/components/alert-badge";
import { cn } from "@/lib/utils";
import type { InventoryRow } from "@/lib/data/types";
import { CATEGORY_LABELS, daysUntil } from "@/lib/dashboard";
import { formatNumber } from "@/lib/format";

export function ReorderQueue({ rows }: { rows: InventoryRow[] }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <CalendarClock className="size-4 text-muted-foreground" />
        <h2 className="text-base font-semibold">Reorder Queue</h2>
        <span className="text-sm text-muted-foreground">
          overdue or due within 14 days · {rows.length}
        </span>
      </div>

      {rows.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">
          Nothing to reorder in the next 14 days.
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((r) => {
            const d = daysUntil(r.reorderDate) ?? 0;
            const overdue = d < 0;
            return (
              <Card
                key={r.productId}
                className={cn(
                  "gap-0 p-4",
                  overdue ? "ring-red-500/40" : "ring-amber-500/30",
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
                      overdue ? "text-red-600" : "text-amber-700",
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
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}
