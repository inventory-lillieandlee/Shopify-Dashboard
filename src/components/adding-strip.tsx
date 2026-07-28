"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { CATEGORY_LABELS } from "@/lib/dashboard";
import type { AddingRow } from "@/lib/data/catalog";

// "Adding…" strip above the main table: products mid-backfill (pending/building) or failed.
// These are active=false, so they never appear in the main table or the engine. Fed by its
// own query (getAddingProducts). While any are pending/building it soft-refreshes every 20s
// so the operator sees the backfill-worker cron advance the cursor.
export function AddingStrip({ rows }: { rows: AddingRow[] }) {
  const router = useRouter();
  const inFlight = rows.some((r) => r.history_status === "pending" || r.history_status === "building");

  useEffect(() => {
    if (!inFlight) return;
    const id = setInterval(() => router.refresh(), 20_000);
    return () => clearInterval(id);
  }, [inFlight, router]);

  if (rows.length === 0) return null;

  return (
    <section aria-label="Products being added" className="rounded-xl border border-border bg-muted/40 p-3">
      <div className="mb-2 flex items-center gap-2 px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        <Loader2 className={cn("size-3.5", inFlight && "animate-spin")} /> Adding history…
      </div>
      <ul className="space-y-1.5">
        {rows.map((r) => {
          const failed = r.history_status === "failed";
          const label =
            r.history_status === "pending"
              ? "queued"
              : r.history_status === "building"
                ? r.history_cursor === "__demand__"
                  ? "computing demand…"
                  : `building ${r.history_cursor ?? "?"} → ${r.history_target_month ?? "?"}`
                : "failed";
          return (
            <li key={r.id} className="flex items-center justify-between gap-3 rounded-lg bg-card px-3 py-2 text-sm">
              <span className="min-w-0">
                <span className="block truncate font-medium">{r.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{CATEGORY_LABELS[r.category as keyof typeof CATEGORY_LABELS] ?? r.category}</span>
              </span>
              <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium", failed ? "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400" : "bg-brand/10 text-brand")}>
                {failed ? <TriangleAlert className="size-3.5" /> : <Loader2 className="size-3.5 animate-spin" />}
                {label}
              </span>
            </li>
          );
        })}
      </ul>
      {rows.some((r) => r.history_status === "failed") && (
        <p className="mt-2 px-1 text-xs text-muted-foreground">
          Failed backfills keep the product inactive; the error is on the row. Remove and re-add to retry.
        </p>
      )}
    </section>
  );
}
