// Alert dispatch orchestrator. For each alerting SKU: apply the dedup decision,
// render the email, and route to the DB recipients whose min_level the alert meets.
// Real sends go via Resend; alert_log is written (service-role) only on success.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { InventoryRow } from "@/lib/data/types";
import { alertReasons } from "@/lib/dashboard";
import { isWritableAlertLevel, recipientsForLevel, type RecipientLike } from "./policy.ts";
import { decideDispatch, type PriorFire, type DispatchReason } from "./dedup.ts";
import { renderAlertEmail, sendAlertEmail } from "./email.ts";
import type { AlertConfig } from "./config.ts";
import type { TierEnabled } from "@/lib/config/projection-config";

export interface DispatchResultRow {
  productId: string;
  sku: string;
  level: string;
  action: "would-send" | "sent" | "skipped" | "error";
  reason: DispatchReason | "no-recipients" | "guard-blocked" | "send-failed" | "muted";
  subject?: string;
  recipients?: string[];
  logged?: boolean;
  error?: string;
}

export interface DispatchReport {
  candidates: number;
  wouldSend: number;
  sent: number;
  skipped: number;
  errors: number;
  results: DispatchResultRow[];
}

export interface RunDispatchOptions {
  rows: InventoryRow[];
  config: AlertConfig;
  /** Active recipients (email + min_level) from alert_recipients. */
  recipients: RecipientLike[];
  alertLogByProduct: Map<string, PriorFire[]>;
  /** category → which tiers email; muted (category, tier) combos are suppressed. */
  alertEnabledByCategory: Map<string, TierEnabled>;
  now: Date;
  dryRun: boolean;
  /** Service-role client for the alert_log insert. Null in dry-run. */
  admin: SupabaseClient | null;
}

export async function runDispatch(opts: RunDispatchOptions): Promise<DispatchReport> {
  const { rows, config, recipients, alertLogByProduct, alertEnabledByCategory, now, dryRun, admin } = opts;
  const results: DispatchResultRow[] = [];

  // Every alerting SKU is a candidate; routing decides who (if anyone) gets it.
  const candidates = rows.filter((r) => r.alertLevel && r.alertLevel !== "ok");

  for (const row of candidates) {
    const level = row.alertLevel as string;
    const base = { productId: row.productId, sku: row.name, level };

    // Per-(category, tier) mute: dashboard still shows the tier, but no email fires.
    const tierEnabled = alertEnabledByCategory.get(row.category)?.[level as keyof TierEnabled] ?? true;
    if (!tierEnabled) {
      results.push({ ...base, action: "skipped", reason: "muted" });
      continue;
    }

    const to = recipientsForLevel(recipients, level);
    const decision = decideDispatch(now, level, alertLogByProduct.get(row.productId) ?? []);

    if (!decision.send) {
      results.push({ ...base, action: "skipped", reason: decision.reason });
      continue;
    }

    const rendered = renderAlertEmail(row, alertReasons(row), config);
    // Provisional lead time: the tier is computed from a category-DEFAULT lead time the
    // operator hasn't confirmed. Still ALERT (14-week lead times — silence is worse), but
    // mark it in the subject, body, and alert_log so nobody places a PO off an unconfirmed
    // estimate. Cleared once an admin confirms the lead time (Task 8).
    const provisional = row.leadTimeProvisional === true;
    const subject = provisional ? `${rendered.subject} (provisional lead time)` : rendered.subject;
    const html = provisional
      ? `<p style="margin:0 0 12px;padding:8px 12px;background:#fef3c7;color:#92400e;border-radius:6px">⚠ Provisional lead time — confirm before ordering.</p>${rendered.html}`
      : rendered.html;

    if (dryRun) {
      results.push({ ...base, action: "would-send", reason: decision.reason, subject, recipients: to });
      continue;
    }

    // ── real send ──
    if (to.length === 0) {
      results.push({ ...base, action: "skipped", reason: "no-recipients" });
      continue;
    }
    try {
      await sendAlertEmail(config, { to, subject, html });
    } catch (e) {
      // send failed → do NOT write alert_log, so it retries next run
      results.push({ ...base, action: "error", reason: "send-failed", error: String(e) });
      continue;
    }

    // GUARD: never insert a non-tier level into alert_log (would violate the CHECK).
    if (!isWritableAlertLevel(level)) {
      console.warn(
        `alert_log guard: refusing to insert level '${level}' for SKU ${row.productId} (${row.name}) — email sent, level not insertable.`,
      );
      results.push({ ...base, action: "sent", reason: "guard-blocked", subject, recipients: to, logged: false });
      continue;
    }

    let logged = false;
    try {
      const ins = await admin!.from("alert_log").insert({
        product_id: row.productId,
        alert_level: level,
        message: subject,
        channels_sent: ["email"],
        lead_time_provisional: provisional,
        fired_at: now.toISOString(),
      });
      if (ins.error) throw new Error(ins.error.message);
      logged = true;
    } catch (e) {
      console.warn(`alert_log insert failed for ${row.productId}: ${String(e)}`);
    }
    results.push({ ...base, action: "sent", reason: decision.reason, subject, recipients: to, logged });
  }

  return {
    candidates: candidates.length,
    wouldSend: results.filter((r) => r.action === "would-send").length,
    sent: results.filter((r) => r.action === "sent").length,
    skipped: results.filter((r) => r.action === "skipped").length,
    errors: results.filter((r) => r.action === "error").length,
    results,
  };
}
