import { cn } from "@/lib/utils";
import type { AlertLevel } from "@/lib/data/types";
import { ALERT_LABELS } from "@/lib/dashboard";

// SOLID, opaque, theme-independent status chips — legibility beats aesthetic, so
// these never go translucent and never sit over the frosted glass directly.
// Each pair is WCAG-AA verified (see report): ratios 6.4–7.3:1.
const STYLES: Record<AlertLevel, string> = {
  ok: "bg-[#d1fae5] text-[#065f46] ring-black/5", // 6.78:1
  yellow: "bg-[#fde68a] text-[#78350f] ring-black/5", // 7.29:1
  red: "bg-[#fecaca] text-[#7f1d1d] ring-black/5", // 6.92:1
  critical: "bg-[#b91c1c] text-white ring-black/10", // 6.47:1
};

const DOT: Record<AlertLevel, string> = {
  ok: "bg-[#059669]",
  yellow: "bg-[#b45309]",
  red: "bg-[#dc2626]",
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
