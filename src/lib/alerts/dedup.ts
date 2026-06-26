// Pure dedup decision — time + level ONLY (no acknowledgement: acknowledge isn't
// built yet and "resolved" must never be a re-send trigger). Matches roadmap §5.3
// plus the escalation rule: re-fire only on escalation or after 24h at the level.

import { levelRank } from "./policy.ts";

/** A prior alert_log fire for one SKU. */
export interface PriorFire {
  alert_level: string;
  fired_at: Date;
}

export type DispatchReason = "first" | "escalation" | "duplicate" | "expiry";

export interface DispatchDecision {
  send: boolean;
  reason: DispatchReason;
}

export const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h

/**
 * Decide whether to fire `current` for a SKU given its prior alert_log rows.
 *   - no priors                        → send (first)
 *   - current more severe than newest  → send (escalation, e.g. red→critical)
 *   - same level fired < 24h ago       → skip (duplicate)
 *   - same level fired ≥ 24h ago       → send (expiry)
 *   - no prior at this level           → send (first)
 */
export function decideDispatch(
  now: Date,
  current: string,
  priors: PriorFire[],
): DispatchDecision {
  if (priors.length === 0) return { send: true, reason: "first" };

  const mostRecent = priors.reduce((a, b) => (b.fired_at > a.fired_at ? b : a));
  if (levelRank(current) > levelRank(mostRecent.alert_level)) {
    return { send: true, reason: "escalation" };
  }

  const atLevel = priors.filter((p) => p.alert_level === current);
  if (atLevel.length === 0) return { send: true, reason: "first" };

  const lastAtLevel = atLevel.reduce((a, b) => (b.fired_at > a.fired_at ? b : a));
  if (now.getTime() - lastAtLevel.fired_at.getTime() < DEDUP_WINDOW_MS) {
    return { send: false, reason: "duplicate" };
  }
  return { send: true, reason: "expiry" };
}
