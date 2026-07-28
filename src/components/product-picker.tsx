"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, RefreshCw, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { CATEGORY_LABELS } from "@/lib/dashboard";
import { TRACKABLE_CATEGORIES } from "@/lib/products/rules";
import type { CatalogOption } from "@/lib/data/catalog";

// Add-product picker (client). Searchable dropdown over the catalog (already excludes
// tracked variants and flags multi-variant as non-selectable — see availableFromCatalog).
// Category is a required, explicit pick (never inferred from the title). Submit → the
// admin-gated /api/products/add; on success the row lands in the "Adding…" strip.
// NOTE: the app has no login, so every write here returns 401 until auth is restored —
// the UI surfaces that plainly rather than pretending to succeed.
export function ProductPicker({ catalog }: { catalog: CatalogOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<CatalogOption | null>(null);
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const base = s
      ? catalog.filter((c) => c.title.toLowerCase().includes(s) || (c.sku ?? "").toLowerCase().includes(s))
      : catalog;
    return base.slice(0, 60); // cap the rendered list; search narrows further
  }, [catalog, q]);

  function reset() {
    setPicked(null);
    setCategory("");
    setQ("");
    setError(null);
  }

  async function submit() {
    if (!picked || !category) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/products/add", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ variant_id: picked.variant_id, category }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(res.status === 401 ? "Sign in as an admin to add products." : String(body.error ?? `Failed (${res.status})`));
        return;
      }
      setOpen(false);
      reset();
      router.refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function refreshCatalog() {
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch("/api/catalog/sync?force=1");
      if (!res.ok) setError(res.status === 401 ? "Sign in as an admin to refresh." : `Refresh failed (${res.status})`);
      else router.refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center gap-1.5 rounded-md bg-brand px-3 text-sm font-medium text-white transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
      >
        <Plus className="size-4" /> Add product
      </button>

      {open && (
        <div role="dialog" aria-modal="true" aria-labelledby="picker-title" className="animate-in fixed inset-0 z-50 flex items-center justify-center p-3 duration-150 fade-in sm:p-4">
          <button type="button" aria-label="Close" tabIndex={-1} onClick={() => !busy && setOpen(false)} className="absolute inset-0 cursor-default bg-black/40 backdrop-blur-[1px]" />
          <div className="animate-in relative flex max-h-[92vh] w-[94vw] max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl duration-200 zoom-in-95">
            <div className="flex items-center justify-between gap-3 border-b border-border p-4 sm:p-5">
              <h2 id="picker-title" className="font-display text-lg font-semibold text-brand">Add a product</h2>
              <div className="flex items-center gap-2">
                <button type="button" onClick={refreshCatalog} disabled={refreshing} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50">
                  <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} /> Refresh catalog
                </button>
                <button type="button" onClick={() => !busy && setOpen(false)} aria-label="Close" className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                  <X className="size-5" />
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-3 overflow-y-auto p-4 sm:p-5">
              <div className="relative">
                <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
                <input
                  autoFocus
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search catalog by title or SKU…"
                  className="h-9 w-full rounded-md border border-border bg-background pr-3 pl-8 text-sm focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
                />
              </div>

              <ul className="max-h-56 divide-y divide-border overflow-y-auto rounded-lg border border-border">
                {filtered.length === 0 ? (
                  <li className="p-4 text-center text-sm text-muted-foreground">No matching untracked products.</li>
                ) : (
                  filtered.map((c) => (
                    <li key={c.variant_id}>
                      <button
                        type="button"
                        disabled={!c.selectable}
                        onClick={() => setPicked(c)}
                        title={c.reason ?? undefined}
                        aria-disabled={!c.selectable}
                        className={cn(
                          "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors",
                          !c.selectable && "cursor-not-allowed opacity-55",
                          c.selectable && picked?.variant_id === c.variant_id ? "bg-brand/10 text-brand" : c.selectable && "hover:bg-muted",
                        )}
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{c.title}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {c.sku ? `SKU ${c.sku}` : "no SKU"}
                            {c.status !== "active" ? ` · ${c.status}` : ""}
                          </span>
                        </span>
                        {!c.selectable && <span className="shrink-0 text-xs text-amber-600 dark:text-amber-400">{c.reason}</span>}
                      </button>
                    </li>
                  ))
                )}
              </ul>

              <div>
                <label htmlFor="picker-category" className="mb-1 block text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Category (required)
                </label>
                <select
                  id="picker-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
                >
                  <option value="" disabled>Pick a category…</option>
                  {TRACKABLE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-muted-foreground">
                  Sets the default lead time; never inferred from the product title. Confirm the lead time later in Settings.
                </p>
              </div>

              {error && <p className="rounded-md bg-red-50 px-2.5 py-1.5 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-400">{error}</p>}
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-border p-4 sm:p-5">
              <span className="text-xs text-muted-foreground">
                {picked ? <>Selected: <strong className="font-medium text-foreground">{picked.title}</strong></> : "Select a product"}
              </span>
              <button
                type="button"
                onClick={submit}
                disabled={busy || !picked || !category}
                className="h-9 rounded-md bg-brand px-4 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {busy ? "Adding…" : "Add to dashboard"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
