import Image from "next/image";
import Link from "next/link";
import { Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { surfacePanel } from "@/lib/surface";

export function SiteHeader() {
  return (
    <header
      className={cn(
        surfacePanel,
        "flex animate-in flex-col gap-3 px-5 py-4 duration-500 fade-in slide-in-from-bottom-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4",
      )}
    >
      <h1 className="sr-only">Lillie &amp; Lee — Inventory</h1>
      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
        <Image
          src="/L_L-logo.png"
          alt="Lillie & Lee — Your Pet Family Company"
          width={2151}
          height={412}
          priority
          className="h-8 w-auto shrink-0 sm:h-9"
        />
        <span className="hidden h-9 w-px bg-border sm:block" aria-hidden="true" />
        <div className="min-w-0">
          <div className="font-display text-lg leading-none font-semibold text-brand">
            Inventory
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground">
            The Pet Family Company · reorder timing &amp; stock-out early warning
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3 self-end sm:self-auto">
        <span className="hidden text-xs text-muted-foreground sm:inline">19 SKUs · live</span>
        <Link
          href="/settings"
          aria-label="Settings"
          title="Settings"
          className="inline-flex size-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:border-brand-sage/60 hover:text-brand focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
        >
          <Settings className="size-[1.15rem]" />
        </Link>
      </div>
    </header>
  );
}
