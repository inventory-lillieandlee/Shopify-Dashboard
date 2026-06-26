// Alert email: pure HTML render (§3.1 fields, color-coded, dates in ALERT_TIMEZONE)
// + the Resend sender. Render is separated from send so dry-run can render without
// sending. Dispatcher is a thin fetch wrapper (no SDK dep) → swappable per CLAUDE.md.

import type { InventoryRow } from "@/lib/data/types";
import { daysUntil, type AlertReason } from "@/lib/dashboard";
import type { AlertConfig } from "./config.ts";

const LEVEL_COLORS: Record<string, { band: string; chipBg: string; chipFg: string }> = {
  yellow: { band: "#f59e0b", chipBg: "#fde68a", chipFg: "#78350f" },
  red: { band: "#dc2626", chipBg: "#fecaca", chipFg: "#7f1d1d" },
  critical: { band: "#b91c1c", chipBg: "#7f1d1d", chipFg: "#ffffff" },
};

const SPIKE_EMAIL_THRESHOLD = 10; // §3.1: spike indicator shown if > 10%

function fmtDateTz(iso: string | null, tz: string): string {
  if (!iso) return "—";
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00Z` : iso);
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(d);
  } catch {
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(d);
  }
}

function num(n: number | null, digits = 0): string {
  return n === null || n === undefined || Number.isNaN(n)
    ? "—"
    : n.toLocaleString("en-US", { maximumFractionDigits: digits });
}

export interface RenderedEmail {
  subject: string;
  html: string;
}

/** Pure: build the subject + color-coded HTML body for one SKU alert. */
export function renderAlertEmail(
  row: InventoryRow,
  reasons: AlertReason[],
  cfg: AlertConfig,
): RenderedEmail {
  const level = row.alertLevel ?? "red";
  const c = LEVEL_COLORS[level] ?? LEVEL_COLORS.red;
  const primary = reasons[0]?.label;
  const subject = `[${level.toUpperCase()}] ${row.name}${primary ? ` · ${primary}` : ""}`;

  const horizon = daysUntil(row.reorderDate);
  const reorder =
    row.reorderDate === null
      ? "—"
      : horizon !== null && horizon < 0
        ? `<strong style="color:${c.band}">OVERDUE (${Math.abs(horizon)} days)</strong>`
        : `${fmtDateTz(row.reorderDate, cfg.timezone)}${horizon !== null ? ` · in ${horizon}d` : ""}`;

  const spikeRow =
    (row.spikePct ?? 0) > SPIKE_EMAIL_THRESHOLD
      ? rowHtml("Demand spike", `▲ ${num(row.spikePct)}% vs projected`)
      : "";

  const dsr = row.daysOfStockRemaining;
  const reasonText = reasons.length ? reasons.map((r) => r.label).join(", ") : "—";
  const link = cfg.dashboardUrl ? `${cfg.dashboardUrl}/sku/${row.shopifyProductId}` : null;

  const html = `<!doctype html><html><body style="margin:0;background:#f4f5f3;font-family:Arial,Helvetica,sans-serif;color:#161d17">
  <div style="max-width:560px;margin:0 auto;padding:24px">
    <div style="border-radius:14px;overflow:hidden;border:1px solid #e3e6e1;background:#fff">
      <div style="background:${c.band};padding:16px 20px">
        <div style="color:#fff;font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.9">${level} alert</div>
        <div style="color:#fff;font-size:18px;font-weight:700;margin-top:2px">${escapeHtml(row.name)}</div>
      </div>
      <div style="padding:8px 20px 4px">
        <span style="display:inline-block;background:${c.chipBg};color:${c.chipFg};font-size:12px;font-weight:700;border-radius:999px;padding:3px 10px;margin:8px 0">${escapeHtml(reasonText)}</span>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin:8px 0 4px">
          ${rowHtml("Current units", num(row.currentUnits))}
          ${rowHtml("Days of stock (DSR)", dsr === null ? "—" : `${num(dsr)}d`)}
          ${rowHtml("Daily demand (DDR)", row.dailyDemandRate === null ? "—" : `${num(row.dailyDemandRate, 1)}/day`)}
          ${rowHtml("Reorder date", reorder)}
          ${rowHtml("Lead time", `${row.leadTimeDays}d`)}
          ${spikeRow}
        </table>
      </div>
      ${
        link
          ? `<div style="padding:4px 20px 20px"><a href="${link}" style="display:inline-block;background:#283c2c;color:#fff;text-decoration:none;font-size:14px;font-weight:600;border-radius:10px;padding:10px 16px">View SKU on dashboard →</a></div>`
          : `<div style="padding:4px 20px 20px;font-size:12px;color:#6b7280">Set ALERT_DASHBOARD_URL to include a dashboard link.</div>`
      }
    </div>
    <div style="text-align:center;font-size:11px;color:#9aa39b;margin-top:14px">Lillie &amp; Lee · automated inventory alert · times in ${escapeHtml(cfg.timezone)}</div>
  </div></body></html>`;

  return { subject, html };
}

function rowHtml(label: string, value: string): string {
  return `<tr><td style="padding:6px 0;color:#6b7280">${escapeHtml(label)}</td><td style="padding:6px 0;text-align:right;font-weight:600">${value}</td></tr>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] as string,
  );
}

export interface SendArgs {
  to: string[];
  subject: string;
  html: string;
}

/**
 * SERVER-ONLY. Sends via the Resend REST API. Reads RESEND_API_KEY (server-only
 * secret — never NEXT_PUBLIC, never client). Throws on non-2xx so the caller can
 * skip the alert_log write and retry next run.
 */
export async function sendAlertEmail(cfg: AlertConfig, msg: SendArgs): Promise<{ id: string }> {
  const key = process.env.RESEND_API_KEY; // server-only secret
  if (!key) throw new Error("RESEND_API_KEY not set");
  if (!cfg.from) throw new Error("ALERT_FROM_EMAIL not set");
  if (msg.to.length === 0) throw new Error("no recipients");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: cfg.from, to: msg.to, subject: msg.subject, html: msg.html }),
  });
  if (!res.ok) {
    throw new Error(`Resend ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { id?: string };
  return { id: data.id ?? "" };
}
