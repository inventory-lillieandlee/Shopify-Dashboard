export function SiteHeader() {
  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            Lillie &amp; Lee{" "}
            <span className="font-normal text-muted-foreground">— Inventory</span>
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            The Pet Family Company · reorder timing &amp; stock-out early warning
          </p>
        </div>
        <div className="text-xs text-muted-foreground sm:text-right">
          Phase 1 · 19 core SKUs
        </div>
      </div>
    </header>
  );
}
