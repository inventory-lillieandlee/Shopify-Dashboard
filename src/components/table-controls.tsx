"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ArrowDownNarrowWide, ArrowUpNarrowWide, X } from "lucide-react";
import { CATEGORIES, type AlertLevel } from "@/lib/data/types";
import { ALERT_LABELS, CATEGORY_LABELS, type SortKey } from "@/lib/dashboard";
import { Select } from "@/components/ui/select";

const ALERT_OPTIONS: AlertLevel[] = ["critical", "red", "yellow", "ok"];
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "dsr", label: "Days of stock" },
  { key: "units", label: "Current units" },
  { key: "name", label: "Product" },
];

export function TableControls({
  category,
  alert,
  sort,
  dir,
}: {
  category?: string;
  alert?: string;
  sort: SortKey;
  dir: "asc" | "desc";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function update(next: Record<string, string | null>) {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null || v === "all" || v === "") p.delete(k);
      else p.set(k, v);
    }
    const qs = p.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const hasFilters = Boolean(category) || Boolean(alert);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
        Category
        <Select value={category ?? "all"} onChange={(e) => update({ category: e.target.value })}>
          <option value="all">All</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </Select>
      </label>

      <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
        Alert
        <Select value={alert ?? "all"} onChange={(e) => update({ alert: e.target.value })}>
          <option value="all">All</option>
          {ALERT_OPTIONS.map((a) => (
            <option key={a} value={a}>
              {ALERT_LABELS[a]}
            </option>
          ))}
        </Select>
      </label>

      <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
        Sort
        <Select value={sort} onChange={(e) => update({ sort: e.target.value })}>
          {SORT_OPTIONS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </Select>
      </label>

      <button
        type="button"
        onClick={() => update({ dir: dir === "asc" ? "desc" : "asc" })}
        className="inline-flex h-9 items-center gap-1.5 rounded-md border bg-card px-2.5 text-sm shadow-xs transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
        title={dir === "asc" ? "Ascending" : "Descending"}
      >
        {dir === "asc" ? (
          <ArrowUpNarrowWide className="size-4" />
        ) : (
          <ArrowDownNarrowWide className="size-4" />
        )}
        {dir === "asc" ? "Asc" : "Desc"}
      </button>

      {hasFilters && (
        <button
          type="button"
          onClick={() => update({ category: null, alert: null })}
          className="inline-flex h-9 items-center gap-1 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
        >
          <X className="size-3.5" /> Clear
        </button>
      )}
    </div>
  );
}
