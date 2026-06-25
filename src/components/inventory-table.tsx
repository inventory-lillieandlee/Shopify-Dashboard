import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AlertBadge } from "@/components/alert-badge";
import { AlertReasonText } from "@/components/alert-reason";
import { cn } from "@/lib/utils";
import type { InventoryRow } from "@/lib/data/types";
import {
  CATEGORY_LABELS,
  daysUntil,
  primaryAlertReason,
  SPIKE_ALERT_THRESHOLD,
  SPIKE_DISPLAY_THRESHOLD,
  type SortDir,
  type SortKey,
} from "@/lib/dashboard";
import { formatDate, formatNumber, formatRelative } from "@/lib/format";

function sortMark(active: boolean, dir: SortDir) {
  if (!active) return null;
  return <span className="text-muted-foreground">{dir === "asc" ? " ▲" : " ▼"}</span>;
}

function ReorderCell({ iso }: { iso: string | null }) {
  const d = daysUntil(iso);
  if (d === null) return <span className="text-muted-foreground">—</span>;
  if (d < 0) {
    return (
      <span className="font-semibold text-red-600">
        OVERDUE <span className="font-normal opacity-75">· {Math.abs(d)}d</span>
      </span>
    );
  }
  return (
    <span className="tabular-nums">
      {formatDate(iso)}
      <span className="text-muted-foreground"> · in {d}d</span>
    </span>
  );
}

function SpikeCell({ pct }: { pct: number | null }) {
  if (pct === null || pct < SPIKE_DISPLAY_THRESHOLD) {
    return <span className="text-muted-foreground">—</span>;
  }
  const critical = pct >= SPIKE_ALERT_THRESHOLD;
  // SOLID opaque chip — never translucent over the surfaces. AA-verified:
  // ≥15% red 5.30:1, 10–14% amber 6.37:1.
  const title = critical
    ? `${formatNumber(pct, 0)}% above projected 7-day demand — spike alert (≥${SPIKE_ALERT_THRESHOLD}%)`
    : `${formatNumber(pct, 0)}% above projected 7-day demand — watch (below ${SPIKE_ALERT_THRESHOLD}% alert)`;
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums",
        critical ? "bg-[#fee2e2] text-[#b91c1c]" : "bg-[#fef3c7] text-[#92400e]",
      )}
    >
      ▲ {formatNumber(pct, 0)}%
    </span>
  );
}

export function InventoryTable({
  rows,
  sort,
  dir,
}: {
  rows: InventoryRow[];
  sort: SortKey;
  dir: SortDir;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent [&>th]:h-9 [&>th]:text-xs [&>th]:font-medium [&>th]:uppercase [&>th]:tracking-wide [&>th]:text-muted-foreground">
          <TableHead>Product{sortMark(sort === "name", dir)}</TableHead>
          <TableHead>Category</TableHead>
          <TableHead className="text-right">
            Current Units{sortMark(sort === "units", dir)}
          </TableHead>
          <TableHead className="text-right">
            Days of Stock{sortMark(sort === "dsr", dir)}
          </TableHead>
          <TableHead>Reorder Date</TableHead>
          <TableHead>Alert</TableHead>
          <TableHead>Spike</TableHead>
          <TableHead className="text-right">Last Updated</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
              No SKUs match the current filters.
            </TableCell>
          </TableRow>
        ) : (
          rows.map((r) => (
            <TableRow
              key={r.productId}
              className={cn(r.alertLevel === "critical" && "bg-red-50/60")}
            >
              <TableCell className="font-medium">
                <Link
                  href={`/sku/${r.shopifyProductId}`}
                  className="rounded-sm underline-offset-2 hover:text-brand hover:underline focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
                >
                  {r.name}
                </Link>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {CATEGORY_LABELS[r.category]}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatNumber(r.currentUnits)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {r.daysOfStockRemaining === null
                  ? "—"
                  : `${formatNumber(r.daysOfStockRemaining)}d`}
              </TableCell>
              <TableCell>
                <ReorderCell iso={r.reorderDate} />
              </TableCell>
              <TableCell className="whitespace-nowrap">
                <div className="flex items-center gap-1.5">
                  <AlertBadge level={r.alertLevel} />
                  <AlertReasonText
                    reason={primaryAlertReason(r)}
                    className="whitespace-nowrap"
                  />
                </div>
              </TableCell>
              <TableCell>
                <SpikeCell pct={r.spikePct} />
              </TableCell>
              <TableCell className="text-right text-muted-foreground">
                {formatRelative(r.lastUpdated)}
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
