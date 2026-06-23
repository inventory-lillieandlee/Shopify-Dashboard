import { cn } from "@/lib/utils";
import type { AlertLevel } from "@/lib/data/types";
import { ALERT_LABELS } from "@/lib/dashboard";

const STYLES: Record<AlertLevel, string> = {
  ok: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  yellow: "bg-amber-100 text-amber-900 ring-amber-600/30",
  red: "bg-red-100 text-red-800 ring-red-600/30",
  critical: "bg-red-600 text-white ring-red-700/40",
};

const DOT: Record<AlertLevel, string> = {
  ok: "bg-emerald-500",
  yellow: "bg-amber-500",
  red: "bg-red-500",
  critical: "bg-white",
};

export function AlertBadge({
  level,
  className,
}: {
  level: AlertLevel | null;
  className?: string;
}) {
  if (!level) return <span className="text-muted-foreground">—</span>;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset",
        STYLES[level],
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", DOT[level])} />
      {ALERT_LABELS[level]}
    </span>
  );
}
