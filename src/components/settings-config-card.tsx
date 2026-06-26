import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { surfacePanel } from "@/lib/surface";
import { DEFAULT_CONFIG } from "@/lib/projections/engine";

// Server component — reads non-public env (APP_TIMEZONE/ALERT_TIMEZONE) at request
// time, which is safe ONLY because this never ships to the client bundle.

function Item({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-muted/40 p-3">
      <div className="text-xs tracking-wide text-muted-foreground uppercase">{label}</div>
      <div className="mt-1 font-medium tabular-nums">{value}</div>
      {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

export function SettingsConfigCard() {
  const timezone =
    process.env.APP_TIMEZONE ?? process.env.ALERT_TIMEZONE ?? "America/New_York";
  const growthPct = Math.round((DEFAULT_CONFIG.growth - 1) * 100);

  return (
    <section className={cn(surfacePanel, "space-y-4 p-5")}>
      <div>
        <h2 className="font-display text-lg font-semibold text-brand">Global configuration</h2>
        <p className="text-sm text-muted-foreground">
          Read-only · these drive every projection; editing arrives in a later phase
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Item label="Baseline growth" value={`${growthPct}% MoM`} hint={`×${DEFAULT_CONFIG.growth}`} />
        <Item label="Spike alert" value={`≥ ${DEFAULT_CONFIG.spikeAlertPct}%`} hint="7-day actual vs projected" />
        <Item label="Safety stock (default)" value="30 days" hint="per-SKU below" />
        <Item label="Timezone" value={timezone} hint="date math & reorder dates" />
      </div>
    </section>
  );
}
