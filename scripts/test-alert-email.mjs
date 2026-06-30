// Controlled real-send test for inventory alert emails.
//   node scripts/test-alert-email.mjs you@example.com
// Sends ONE sample CRITICAL alert to the given address using the SAME sender
// (ALERT_FROM_EMAIL) and Resend key (RESEND_API_KEY) the cron uses — so a success
// here proves the domain is verified, the key is valid, and delivery works.
// Reads .env.local; never prints the key. Sends nothing without an explicit address.
import { readFileSync, existsSync } from "node:fs";

function loadEnv(f) {
  if (!existsSync(f)) return;
  for (const l of readFileSync(f, "utf8").split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  }
}
loadEnv(".env");
loadEnv(".env.local");

const to = process.argv[2];
if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
  console.error("usage: node scripts/test-alert-email.mjs recipient@example.com");
  process.exit(1);
}

const key = process.env.RESEND_API_KEY;
const from = process.env.ALERT_FROM_EMAIL;
if (!key) {
  console.error("RESEND_API_KEY is not set in .env.local — add it (server-only) and retry.");
  process.exit(1);
}
if (!from) {
  console.error("ALERT_FROM_EMAIL is not set in .env.local.");
  process.exit(1);
}

const subject = "[CRITICAL] Hip & Joint Soft Chews · Reorder overdue (TEST)";
const html = `<!doctype html><html><body style="margin:0;background:#f4f5f3;font-family:Arial,Helvetica,sans-serif;color:#161d17">
  <div style="max-width:560px;margin:0 auto;padding:24px">
    <div style="border-radius:14px;overflow:hidden;border:1px solid #e3e6e1;background:#fff">
      <div style="background:#b91c1c;padding:16px 20px">
        <div style="color:#fff;font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.9">critical alert · test</div>
        <div style="color:#fff;font-size:18px;font-weight:700;margin-top:2px">Hip &amp; Joint Soft Chews</div>
      </div>
      <div style="padding:8px 20px 4px">
        <span style="display:inline-block;background:#7f1d1d;color:#fff;font-size:12px;font-weight:700;border-radius:999px;padding:3px 10px;margin:8px 0">Reorder overdue</span>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin:8px 0 4px">
          <tr><td style="padding:6px 0;color:#6b7280">Current units</td><td style="padding:6px 0;text-align:right;font-weight:600">800</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280">Days of stock (DSR)</td><td style="padding:6px 0;text-align:right;font-weight:600">66d</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280">Reorder date</td><td style="padding:6px 0;text-align:right;font-weight:600"><strong style="color:#b91c1c">OVERDUE (12 days)</strong></td></tr>
        </table>
        <p style="font-size:12px;color:#6b7280;margin:4px 0 0">This is a delivery test of the Lillie &amp; Lee inventory alert pipeline. If you received it, alerts are working.</p>
      </div>
    </div>
    <div style="text-align:center;font-size:11px;color:#9aa39b;margin-top:14px">Lillie &amp; Lee · automated inventory alert · test send</div>
  </div></body></html>`;

const res = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  body: JSON.stringify({ from, to: [to], subject, html }),
});
const text = await res.text();
if (!res.ok) {
  console.error(`FAILED — Resend ${res.status}: ${text}`);
  if (res.status === 403 || /domain/i.test(text)) {
    console.error("→ Likely the notifications.lillieandlee.com domain isn't verified in Resend yet (add the DNS records).");
  }
  process.exit(1);
}
console.log(`Sent ✓\n  from: ${from}\n  to:   ${to}\n  resend response: ${text}`);
