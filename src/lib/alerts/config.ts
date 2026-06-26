// Alert dispatch configuration, read from env (server-side). The pure parsing
// helpers live in policy.ts; this just wires env → a typed config object.

import { parseRecipients, type AlertLogLevel } from "./policy.ts";

export interface AlertConfig {
  recipients: string[];
  from: string;
  /** Lowest tier that emails. Default 'red' when ALERT_MIN_LEVEL is unset/invalid. */
  minLevel: AlertLogLevel;
  /** IANA tz for date rendering in emails. Default 'America/New_York'. */
  timezone: string;
  /** Base URL for SKU links in emails (no trailing slash). '' = link omitted. */
  dashboardUrl: string;
  /** Whether RESEND_API_KEY is present (real sends possible). Never the value. */
  hasResendKey: boolean;
}

const VALID_MIN = new Set<AlertLogLevel>(["yellow", "red", "critical"]);

export function loadAlertConfig(): AlertConfig {
  const rawMin = (process.env.ALERT_MIN_LEVEL ?? "").trim().toLowerCase();
  const minLevel = VALID_MIN.has(rawMin as AlertLogLevel) ? (rawMin as AlertLogLevel) : "red";
  return {
    recipients: parseRecipients(process.env.ALERT_TO_EMAILS),
    from: process.env.ALERT_FROM_EMAIL ?? "",
    minLevel,
    timezone: process.env.ALERT_TIMEZONE?.trim() || "America/New_York",
    dashboardUrl: (process.env.ALERT_DASHBOARD_URL ?? "").trim().replace(/\/+$/, ""),
    // server-only secret — presence only, never logged or returned as a value
    hasResendKey: Boolean(process.env.RESEND_API_KEY),
  };
}
