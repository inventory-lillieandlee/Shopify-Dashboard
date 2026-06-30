export function DemoBanner() {
  return (
    <div className="sticky top-0 z-50 w-full border-b border-amber-500/40 bg-amber-300 text-amber-950">
      <div className="mx-auto flex max-w-7xl items-center justify-center gap-2 px-4 py-1.5 text-center text-xs font-semibold tracking-wide">
        <span className="inline-block size-1.5 animate-pulse rounded-full bg-amber-900/80" />
        Shopify location on-hand only · excludes 3PL warehouse.
      </div>
    </div>
  );
}
