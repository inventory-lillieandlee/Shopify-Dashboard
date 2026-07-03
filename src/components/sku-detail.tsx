import type { ReactNode } from "react";
import { AlertBadge } from "@/components/alert-badge";
import { AlertReasonList } from "@/components/alert-reason";
import { cn } from "@/lib/utils";
import { surfacePanel } from "@/lib/surface";
import type { InventoryRow } from "@/lib/data/types";
import { CATEGORY_LABELS, alertReasons, daysUntil } from "@/lib/dashboard";
import { deriveThresholds } from "@/lib/projections/engine";
import { formatDate, formatNumber, formatRelative, reorderLabel } from "@/lib/format";

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/40 p-3">
      <div className="text-xs tracking-wide text-muted-foreground uppercase">{label}</div>
      <div className="mt-1 font-medium tabular-nums">{value}</div>
      {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

/**
 * Full computed picture for one SKU (read-only). No historical charts — that's
 * Phase 3. Every value comes from the InventoryRow the seam already returns; the
 * threshold band is derived with the engine's deriveThresholds() so the "why" is
 * explainable, not a second source of truth.
 */
export function SkuDetail({ row }: { row: InventoryRow }) {
  const reasons = alertReasons(row);
  const horizon = daysUntil(row.reorderDate);
  const t = deriveThresholds(row.leadTimeDays, row.safetyStockDays);
  const dsr = row.daysOfStockRemaining;

  return (
    <div className={cn(surfacePanel, "space-y-6 p-6")}>
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl font-semibold text-brand">{row.name}</h1>
          <AlertBadge level={row.alertLevel} />
        </div>
        <div className="text-sm text-muted-foreground">{CATEGORY_LABELS[row.category]}</div>
        <AlertReasonList reasons={reasons} />
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="Current units" value={formatNumber(row.currentUnits)} hint="Shopify on-hand" />
        <Stat label="Total units" value={formatNumber(row.totalUnits)} hint="3PL not yet connected" />
        <Stat
          label="Daily demand (DDR)"
          value={row.dailyDemandRate === null ? "—" : `${formatNumber(row.dailyDemandRate, 1)}/day`}
        />
        <Stat
          label="Days of stock (DSR)"
          value={dsr === null ? "—" : `${formatNumber(dsr)}d`}
        />
        <Stat
          label="Reorder date"
          value={formatDate(row.reorderDate)}
          hint={horizon === null ? undefined : reorderLabel(horizon)}
        />
        <Stat
          label="Demand spike"
          value={row.spikePct === null ? "—" : `${formatNumber(row.spikePct, 0)}%`}
          hint="vs projected 7-day demand"
        />
        <Stat label="Lead time" value={`${row.leadTimeDays}d`} />
        <Stat label="Safety stock" value={`${row.safetyStockDays}d`} />
        <Stat label="Last updated" value={formatRelative(row.lastUpdated)} />
      </div>

      <section className="space-y-1 text-sm text-muted-foreground">
        <div className="font-medium text-foreground">Why this alert</div>
        <p>
          Alert bands for this SKU are derived from its lead time ({row.leadTimeDays}d) plus
          safety stock ({row.safetyStockDays}d): critical at ≤&nbsp;{t.critical}d of stock,
          red at ≤&nbsp;{t.red}d, yellow at ≤&nbsp;{t.yellow}d. A demand spike alerts at
          ≥&nbsp;15% above projected. An overdue reorder date is on its own a critical signal.
          {reasons.length > 0 &&
            ` Currently flagged for: ${reasons.map((r) => r.label).join(", ")}.`}
        </p>
      </section>
    </div>
  );
}
