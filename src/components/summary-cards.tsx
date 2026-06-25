import { Boxes, CircleAlert, OctagonAlert, TrendingUp, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { surfacePanel } from "@/lib/surface";
import type { Summary } from "@/lib/dashboard";

type Stat = {
  label: string;
  value: number;
  sub: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string; // top severity bar
  chip: string; // icon chip bg + text
  value_tone: string;
};

function stats(s: Summary): Stat[] {
  return [
    {
      label: "Total SKUs", value: s.totalSkus, sub: "tracked, active", icon: Boxes,
      accent: "bg-brand", chip: "bg-secondary text-brand", value_tone: "text-foreground",
    },
    {
      label: "Yellow", value: s.yellow, sub: "plan ahead · DSR ≤ 150", icon: TriangleAlert,
      accent: "bg-amber-400", chip: "bg-amber-100 text-amber-700", value_tone: "text-amber-700",
    },
    {
      label: "Red", value: s.red, sub: "act now · DSR ≤ 90", icon: CircleAlert,
      accent: "bg-red-500", chip: "bg-red-100 text-red-700", value_tone: "text-red-700",
    },
    {
      label: "Critical", value: s.critical, sub: "overdue / DSR ≤ 45 / spike", icon: OctagonAlert,
      accent: "bg-red-700", chip: "bg-red-100 text-red-800", value_tone: "text-red-800",
    },
    {
      label: "Spiking", value: s.spiking, sub: "≥ 15% above plan", icon: TrendingUp,
      accent: "bg-violet-500", chip: "bg-violet-100 text-violet-700", value_tone: "text-violet-700",
    },
  ];
}

export function SummaryCards({ summary }: { summary: Summary }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {stats(summary).map((s, i) => {
        const Icon = s.icon;
        return (
          <Card
            key={s.label}
            style={{ animationDelay: `${i * 70}ms` }}
            className={cn(
              surfacePanel,
              "relative animate-in gap-0 overflow-hidden p-4 ring-0 duration-500 fade-in slide-in-from-bottom-2",
            )}
          >
            <span className={cn("absolute inset-x-0 top-0 h-1", s.accent)} aria-hidden="true" />
            <div className="flex items-start justify-between">
              <span className={cn("inline-flex size-7 items-center justify-center rounded-lg", s.chip)}>
                <Icon className="size-4" />
              </span>
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {s.label}
              </span>
            </div>
            <div className={cn("mt-3 font-display text-4xl leading-none tabular-nums", s.value_tone)}>
              {s.value}
            </div>
            <div className="mt-2 text-xs text-muted-foreground">{s.sub}</div>
          </Card>
        );
      })}
    </div>
  );
}
