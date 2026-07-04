"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { AlertBadge } from "@/components/alert-badge";
import { AlertReasonList } from "@/components/alert-reason";
import { SalesChart } from "@/components/ui/sales-chart";
import { lastNMonths, shortMonth, type MonthlySale } from "@/lib/sales";
import { CATEGORY_LABELS, alertReasons, daysUntil } from "@/lib/dashboard";
import { formatDate, formatNumber, reorderLabel } from "@/lib/format";
import type { InventoryRow } from "@/lib/data/types";

const RANGES = [1, 3, 6] as const;
type Range = (typeof RANGES)[number];

/** SKU sales popup: monthly bar chart (1/3/6-month filter) + the SKU's live details.
 *  Accessible (Esc/backdrop close, body scroll-lock, focus-labelled), 380px-first. */
export function SalesPopup({
  row,
  sales,
  currentMonth,
  onClose,
}: {
  row: InventoryRow;
  sales: MonthlySale[];
  currentMonth: string;
  onClose: () => void;
}) {
  const [months, setMonths] = useState<Range>(6);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden"; // scroll-lock
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const bars = useMemo(
    () => lastNMonths(sales, months).map((s) => ({ label: shortMonth(s.month), units: s.units, partial: s.month === currentMonth })),
    [sales, months, currentMonth],
  );
  const reasons = alertReasons(row);
  const horizon = daysUntil(row.reorderDate);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="sales-popup-title"
      className="animate-in fixed inset-0 z-50 flex items-center justify-center p-3 duration-150 fade-in sm:p-4"
    >
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/40 backdrop-blur-[1px]"
      />
      <div className="animate-in relative flex max-h-[92vh] w-[94vw] max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl duration-200 zoom-in-95">
        <div className="flex items-start justify-between gap-3 border-b border-border p-4 sm:p-5">
          <div className="min-w-0">
            <h2 id="sales-popup-title" className="font-display text-lg leading-tight font-semibold text-brand">
              {row.name}
            </h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <AlertBadge level={row.alertLevel} />
              <span className="text-xs text-muted-foreground">{CATEGORY_LABELS[row.category]}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-4 sm:p-5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Monthly units sold</div>
            <div className="inline-flex rounded-lg border border-border bg-muted p-0.5">
              {RANGES.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMonths(m)}
                  aria-pressed={months === m}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    months === m ? "bg-card text-brand shadow-xs" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {m}m
                </button>
              ))}
            </div>
          </div>

          {sales.length === 0 ? (
            <div className="rounded-xl border border-border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
              No sales history recorded yet.
            </div>
          ) : (
            <SalesChart data={bars} />
          )}

          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            History starts <strong className="font-medium text-foreground">April 2026</strong> — earlier months show 0.
            The current month is partial (<em>MTD</em>).
          </p>

          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <Stat label="Current units" value={formatNumber(row.currentUnits)} />
            <Stat
              label="Days of stock"
              value={row.daysOfStockRemaining == null ? "—" : `${formatNumber(row.daysOfStockRemaining)}d`}
            />
            <Stat
              label="Daily demand"
              value={row.dailyDemandRate == null ? "—" : `${formatNumber(row.dailyDemandRate, 1)}/day`}
            />
            <Stat
              label="Reorder date"
              value={formatDate(row.reorderDate)}
              hint={horizon == null ? undefined : reorderLabel(horizon)}
            />
          </div>

          {reasons.length > 0 && (
            <div className="mt-3">
              <div className="mb-1 text-xs tracking-wide text-muted-foreground uppercase">Why this alert</div>
              <AlertReasonList reasons={reasons} />
            </div>
          )}

          <div className="mt-4">
            <Link
              href={`/sku/${row.shopifyProductId}`}
              className="text-sm font-medium text-brand underline-offset-2 hover:underline"
            >
              View full details →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-muted/40 p-3">
      <div className="text-xs tracking-wide text-muted-foreground uppercase">{label}</div>
      <div className="mt-0.5 font-medium tabular-nums">{value}</div>
      {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}
