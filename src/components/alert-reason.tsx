import { cn } from "@/lib/utils";
import type { AlertReason } from "@/lib/dashboard";

// Presentational only. The "why" sits NEXT TO the AlertBadge (never inside it) so
// the badge stays a pure level chip. Colour lives on the badge; the reason text is
// deliberately muted so it reads as a secondary clarifier, not a competing signal.

/** Inline primary driver, e.g. "· reorder overdue". Renders nothing when null. */
export function AlertReasonText({
  reason,
  lead = true,
  className,
}: {
  reason: AlertReason | null;
  /** Prefix with a "· " separator (for sitting after a badge). */
  lead?: boolean;
  className?: string;
}) {
  if (!reason) return null;
  return (
    <span className={cn("text-xs font-medium text-muted-foreground", className)}>
      {lead ? "· " : ""}
      {reason.label}
    </span>
  );
}

/** All active drivers as small chips — used in the SKU detail view. */
export function AlertReasonList({
  reasons,
  className,
}: {
  reasons: AlertReason[];
  className?: string;
}) {
  if (reasons.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {reasons.map((r) => (
        <span
          key={`${r.kind}:${r.label}`}
          className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground/80"
        >
          {r.label}
        </span>
      ))}
    </div>
  );
}
