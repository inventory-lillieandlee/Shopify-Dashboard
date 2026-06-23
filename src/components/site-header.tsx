import { cn } from "@/lib/utils";
import { glassPanel } from "@/lib/glass";

export function SiteHeader() {
  return (
    <header
      className={cn(
        glassPanel,
        "flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-end sm:justify-between",
      )}
    >
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
    </header>
  );
}
