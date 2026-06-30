// Alert dispatch config from env. Recipients now live in the DB (alert_recipients,
// editable in Settings) — NOT here. This holds only the sender + render settings.

export interface AlertConfig {
  /** Resend-verified sender. */
  from: string;
  /** IANA tz for date rendering in emails. Default 'America/New_York'. */
  timezone: string;
  /** Base URL for SKU links in emails (no trailing slash). '' = link omitted. */
  dashboardUrl: string;
  /** Whether RESEND_API_KEY is present (real sends possible). Never the value. */
  hasResendKey: boolean;
}

export function loadAlertConfig(): AlertConfig {
  return {
    from: process.env.ALERT_FROM_EMAIL ?? "",
    timezone: process.env.ALERT_TIMEZONE?.trim() || "America/New_York",
    dashboardUrl: (process.env.ALERT_DASHBOARD_URL ?? "").trim().replace(/\/+$/, ""),
    // server-only secret — presence only, never logged or returned as a value
    hasResendKey: Boolean(process.env.RESEND_API_KEY),
  };
}
