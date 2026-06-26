// Alert dispatch orchestrator. Filters rows ≥ min level, applies the dedup
// decision, renders the email, then either (dry-run) collects what WOULD send or
// (real) sends via Resend and — only on a successful send — writes alert_log via
// the service-role client. I/O is injected so this stays straightforward to read.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { InventoryRow } from "@/lib/data/types";
import { alertReasons } from "@/lib/dashboard";
import { meetsMinLevel, isWritableAlertLevel } from "./policy.ts";
import { decideDispatch, type PriorFire, type DispatchReason } from "./dedup.ts";
import { renderAlertEmail, sendAlertEmail } from "./email.ts";
import type { AlertConfig } from "./config.ts";

export interface DispatchResultRow {
  productId: string;
  sku: string;
  level: string;
  action: "would-send" | "sent" | "skipped" | "error";
  reason: DispatchReason | "below-min" | "guard-blocked" | "send-failed";
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
  alertLogByProduct: Map<string, PriorFire[]>;
  now: Date;
  dryRun: boolean;
  /** Service-role client for the alert_log insert. Null in dry-run. */
  admin: SupabaseClient | null;
}

export async function runDispatch(opts: RunDispatchOptions): Promise<DispatchReport> {
  const { rows, config, alertLogByProduct, now, dryRun, admin } = opts;
  const results: DispatchResultRow[] = [];

  const candidates = rows.filter(
    (r) => r.alertLevel && meetsMinLevel(r.alertLevel, config.minLevel),
  );

  for (const row of candidates) {
    const level = row.alertLevel as string;
    const base = { productId: row.productId, sku: row.name, level };
    const priors = alertLogByProduct.get(row.productId) ?? [];
    const decision = decideDispatch(now, level, priors);

    if (!decision.send) {
      results.push({ ...base, action: "skipped", reason: decision.reason });
      continue;
    }

    const reasons = alertReasons(row);
    const { subject, html } = renderAlertEmail(row, reasons, config);

    if (dryRun) {
      results.push({
        ...base,
        action: "would-send",
        reason: decision.reason,
        subject,
        recipients: config.recipients,
      });
      continue;
    }

    // ── real send path ──
    if (config.recipients.length === 0) {
      results.push({ ...base, action: "error", reason: "send-failed", error: "no recipients configured" });
      continue;
    }
    try {
      await sendAlertEmail(config, { to: config.recipients, subject, html });
    } catch (e) {
      // send failed → do NOT write alert_log, so it retries next run
      results.push({ ...base, action: "error", reason: "send-failed", error: String(e) });
      continue;
    }

    // GUARD: never attempt an alert_log insert with a non-tier level (would
    // violate the CHECK and crash the cron). Unreachable post-filter, but enforced.
    if (!isWritableAlertLevel(level)) {
      console.warn(
        `alert_log guard: refusing to insert level '${level}' for SKU ${row.productId} (${row.name}) — email was sent, but this level is not insertable.`,
      );
      results.push({ ...base, action: "sent", reason: "guard-blocked", subject, logged: false });
      continue;
    }

    let logged = false;
    try {
      const ins = await admin!
        .from("alert_log")
        .insert({
          product_id: row.productId,
          alert_level: level,
          message: subject,
          channels_sent: ["email"],
          fired_at: now.toISOString(),
        });
      if (ins.error) throw new Error(ins.error.message);
      logged = true;
    } catch (e) {
      console.warn(`alert_log insert failed for ${row.productId}: ${String(e)}`);
    }
    results.push({ ...base, action: "sent", reason: decision.reason, subject, recipients: config.recipients, logged });
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
