import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AlertBadge } from "@/components/alert-badge";
import { cn } from "@/lib/utils";
import type { InventoryRow } from "@/lib/data/types";
import {
  CATEGORY_LABELS,
  daysUntil,
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
  return (
    <span
      className={cn(
        "font-medium tabular-nums",
        critical ? "text-red-600" : "text-amber-600",
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
        <TableRow className="hover:bg-transparent">
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
              <TableCell className="font-medium">{r.name}</TableCell>
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
              <TableCell>
                <AlertBadge level={r.alertLevel} />
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
