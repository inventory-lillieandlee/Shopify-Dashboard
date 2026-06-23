import { Boxes, CircleAlert, OctagonAlert, TrendingUp, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { glassPanel } from "@/lib/glass";
import type { Summary } from "@/lib/dashboard";

type Stat = {
  label: string;
  value: number;
  sub: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
};

function stats(s: Summary): Stat[] {
  return [
    { label: "Total SKUs", value: s.totalSkus, sub: "tracked, active", icon: Boxes, tone: "text-foreground" },
    { label: "Yellow", value: s.yellow, sub: "plan ahead · DSR ≤ 150", icon: TriangleAlert, tone: "text-amber-700" },
    { label: "Red", value: s.red, sub: "act now · DSR ≤ 90", icon: CircleAlert, tone: "text-red-700" },
    { label: "Critical", value: s.critical, sub: "overdue / DSR ≤ 45 / spike", icon: OctagonAlert, tone: "text-red-800" },
    { label: "Spiking", value: s.spiking, sub: "≥ 15% above plan", icon: TrendingUp, tone: "text-fuchsia-700" },
  ];
}

export function SummaryCards({ summary }: { summary: Summary }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {stats(summary).map((s) => {
        const Icon = s.icon;
        return (
          <Card key={s.label} className={cn(glassPanel, "gap-0 p-4 ring-0")}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {s.label}
              </span>
              <Icon className={cn("size-4", s.tone)} />
            </div>
            <div className={cn("mt-2 text-3xl font-semibold tabular-nums", s.tone)}>
              {s.value}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">{s.sub}</div>
          </Card>
        );
      })}
    </div>
  );
}
