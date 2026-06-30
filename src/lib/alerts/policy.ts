// Pure alert policy helpers — no env, no I/O, fully unit-tested.
// Level ordering, min-level filtering, recipient parsing, and the alert_log
// write guard all live here so the dispatch/route code stays declarative.

export type AlertLevel = "ok" | "yellow" | "red" | "critical";

// ok < yellow < red < critical. `ok` is rank 0 so it never clears a min-level.
export const LEVEL_RANK: Record<AlertLevel, number> = {
  ok: 0,
  yellow: 1,
  red: 2,
  critical: 3,
};

/** Numeric severity; unknown/garbage levels rank -1 (below everything). */
export function levelRank(level: string): number {
  return level in LEVEL_RANK ? LEVEL_RANK[level as AlertLevel] : -1;
}

/**
 * Does `level` email at the configured floor? Must be at least `min` AND never
 * `ok` (we never email an OK SKU, even if a bad min were passed).
 */
export function meetsMinLevel(level: string, min: string): boolean {
  return levelRank(level) > 0 && levelRank(level) >= levelRank(min);
}

/** Comma-separated recipients → trimmed, de-blanked list. Empty/undefined → []. */
export function parseRecipients(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// ── alert_log write guard ────────────────────────────────────────────────────
// The alert_log CHECK constraint allows only ('yellow','red','critical','spike').
// We only ever WRITE the three tier levels — never 'ok' (would violate the
// constraint and crash the cron) and never 'spike' (spikes escalate to critical).
export const ALERT_LOG_LEVELS = ["yellow", "red", "critical"] as const;
export type AlertLogLevel = (typeof ALERT_LOG_LEVELS)[number];

/** True only for levels that are safe to INSERT into alert_log. */
export function isWritableAlertLevel(level: string): level is AlertLogLevel {
  return (ALERT_LOG_LEVELS as readonly string[]).includes(level);
}

// ── recipient routing ────────────────────────────────────────────────────────
export interface RecipientLike {
  email: string;
  /** lowest alert level this recipient wants. */
  min_level: string;
}

/**
 * Emails to notify for an alert at `level`: active recipients whose floor is met
 * (min_level ≤ level). `ok` notifies no one. Pure — drives the DB-backed routing.
 */
export function recipientsForLevel(recipients: RecipientLike[], level: string): string[] {
  const L = levelRank(level);
  if (L <= 0) return []; // ok / unknown → nobody
  return recipients.filter((r) => levelRank(r.min_level) <= L).map((r) => r.email);
}
