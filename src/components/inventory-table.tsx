"use client";

import { useState, type ReactNode, type KeyboardEvent } from "react";
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
import { SalesPopup } from "@/components/sales-popup";
import { cn } from "@/lib/utils";
import type { InventoryRow } from "@/lib/data/types";
import type { MonthlySale } from "@/lib/sales";
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

// Enter/Space activate a clickable row/card (they carry role="button").
function onActivate(e: KeyboardEvent, fn: () => void) {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    fn();
  }
}

// Mobile (< lg): each SKU is a stacked card (no horizontal scroll). Whole card opens
// the sales popup; same ReorderCell/SpikeCell/AlertBadge as the desktop table.
function MobileCards({ rows, onOpen }: { rows: InventoryRow[]; onOpen: (r: InventoryRow) => void }) {
  if (rows.length === 0) {
    return <div className="px-4 py-10 text-center text-sm text-muted-foreground">No SKUs match the current filters.</div>;
  }
  return (
    <ul className="divide-y divide-border">
      {rows.map((r) => (
        <li
          key={r.productId}
          role="button"
          tabIndex={0}
          aria-label={`${r.name} — sales & details`}
          onClick={() => onOpen(r)}
          onKeyDown={(e) => onActivate(e, () => onOpen(r))}
          className={cn(
            "cursor-pointer p-4 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none",
            r.alertLevel === "critical" && "bg-red-50/60",
          )}
        >
          <div className="font-medium text-brand">{r.name}</div>
          <div className="text-xs text-muted-foreground">{CATEGORY_LABELS[r.category]}</div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <AlertBadge level={r.alertLevel} />
            <AlertReasonText reason={primaryAlertReason(r)} />
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
            <Field label="Units" value={<span className="tabular-nums">{formatNumber(r.currentUnits)}</span>} />
            <Field
              label="Days of stock"
              value={<span className="tabular-nums">{r.daysOfStockRemaining === null ? "—" : `${formatNumber(r.daysOfStockRemaining)}d`}</span>}
            />
            <Field label="Reorder date" value={<ReorderCell iso={r.reorderDate} />} />
            <Field label="Spike" value={<SpikeCell pct={r.spikePct} />} />
          </dl>
          <div className="mt-3 text-xs text-muted-foreground">Updated {formatRelative(r.lastUpdated)}</div>
        </li>
      ))}
    </ul>
  );
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-xs tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className="mt-0.5 text-sm">{value}</dd>
    </div>
  );
}

export function InventoryTable({
  rows,
  sort,
  dir,
  sales,
  currentMonth,
}: {
  rows: InventoryRow[];
  sort: SortKey;
  dir: SortDir;
  sales: Record<string, MonthlySale[]>;
  currentMonth: string;
}) {
  const [selected, setSelected] = useState<InventoryRow | null>(null);

  return (
    <>
      {/* Mobile / tablet (< lg): stacked cards. */}
      <div className="lg:hidden">
        <MobileCards rows={rows} onOpen={setSelected} />
      </div>

      {/* Desktop (lg+): table; each row opens the popup. */}
      <div className="hidden lg:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent [&>th]:h-9 [&>th]:text-xs [&>th]:font-medium [&>th]:uppercase [&>th]:tracking-wide [&>th]:text-muted-foreground">
              <TableHead>Product{sortMark(sort === "name", dir)}</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Current Units{sortMark(sort === "units", dir)}</TableHead>
              <TableHead className="text-right">Days of Stock{sortMark(sort === "dsr", dir)}</TableHead>
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
                  role="button"
                  tabIndex={0}
                  aria-label={`${r.name} — sales & details`}
                  onClick={() => setSelected(r)}
                  onKeyDown={(e) => onActivate(e, () => setSelected(r))}
                  className={cn("cursor-pointer", r.alertLevel === "critical" && "bg-red-50/60")}
                >
                  <TableCell className="font-medium text-brand">{r.name}</TableCell>
                  <TableCell className="text-muted-foreground">{CATEGORY_LABELS[r.category]}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(r.currentUnits)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.daysOfStockRemaining === null ? "—" : `${formatNumber(r.daysOfStockRemaining)}d`}
                  </TableCell>
                  <TableCell>
                    <ReorderCell iso={r.reorderDate} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <AlertBadge level={r.alertLevel} />
                      <AlertReasonText reason={primaryAlertReason(r)} className="whitespace-nowrap" />
                    </div>
                  </TableCell>
                  <TableCell>
                    <SpikeCell pct={r.spikePct} />
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">{formatRelative(r.lastUpdated)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {selected && (
        <SalesPopup
          row={selected}
          sales={sales[selected.productId] ?? []}
          currentMonth={currentMonth}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
