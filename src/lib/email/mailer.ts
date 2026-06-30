// Server-only generic mailer over the Resend REST API — the single source of the
// Resend POST (alerts AND invites go through here). Reads RESEND_API_KEY (server-only
// secret, never NEXT_PUBLIC) and defaults the sender to ALERT_FROM_EMAIL. Throws on
// non-2xx so callers can decide how to recover.

export interface SendEmailArgs {
  to: string[];
  subject: string;
  html: string;
  /** Override the sender; defaults to ALERT_FROM_EMAIL. */
  from?: string;
}

export async function sendEmail(args: SendEmailArgs): Promise<{ id: string }> {
  const key = process.env.RESEND_API_KEY; // server-only secret
  const from = args.from ?? process.env.ALERT_FROM_EMAIL ?? "";
  if (!key) throw new Error("RESEND_API_KEY not set");
  if (!from) throw new Error("ALERT_FROM_EMAIL not set");
  if (args.to.length === 0) throw new Error("no recipients");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: args.to, subject: args.subject, html: args.html }),
  });
  if (!res.ok) {
    throw new Error(`Resend ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { id?: string };
  return { id: data.id ?? "" };
}
