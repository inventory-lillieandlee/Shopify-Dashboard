import { CalendarClock } from "lucide-react";
import { AlertBadge } from "@/components/alert-badge";
import { AlertReasonText } from "@/components/alert-reason";
import { cn } from "@/lib/utils";
import { surfacePanel } from "@/lib/surface";
import type { InventoryRow } from "@/lib/data/types";
import { CATEGORY_LABELS, daysUntil, primaryAlertReason } from "@/lib/dashboard";
import { formatNumber } from "@/lib/format";

export function ReorderQueue({ rows }: { rows: InventoryRow[] }) {
  return (
    <section
      className={cn(
        surfacePanel,
        "animate-in space-y-4 p-5 duration-500 fade-in slide-in-from-bottom-2",
      )}
    >
      <div className="flex items-center gap-2">
        <CalendarClock className="size-4 text-brand-sage" />
        <h2 className="font-display text-lg font-semibold text-brand">
          Reorder Queue
        </h2>
        <span className="text-sm text-muted-foreground">
          overdue or due within 14 days · {rows.length}
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-muted p-6 text-sm text-muted-foreground">
          Nothing to reorder in the next 14 days.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((r) => {
            const d = daysUntil(r.reorderDate) ?? 0;
            const overdue = d < 0;
            const reason = primaryAlertReason(r);
            return (
              <div
                key={r.productId}
                className={cn(
                  "rounded-xl border border-l-4 border-border bg-muted p-4 transition-shadow hover:shadow-sm",
                  overdue ? "border-l-red-600" : "border-l-amber-500",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium" title={r.name}>
                      {r.name}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      {CATEGORY_LABELS[r.category]}
                      <AlertReasonText reason={reason} />
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
