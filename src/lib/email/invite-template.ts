// Pure render of the branded team-invite email (sent via Resend, not Supabase).
// Mirrors the alert email's visual language: forest-green band + CTA, quiet footer.

export interface InviteEmailOpts {
  /** The accept link (our /auth/confirm?token_hash=…&type=invite&redirect_to=/set-password). */
  inviteUrl: string;
  role: "admin" | "viewer";
}

export interface RenderedEmail {
  subject: string;
  html: string;
}

const BRAND = "#283c2c";

export function renderInviteEmail({ inviteUrl, role }: InviteEmailOpts): RenderedEmail {
  const roleLabel = role === "admin" ? "Admin" : "Viewer";
  const access =
    role === "admin"
      ? "You'll have full access — view the dashboard and manage settings, alerts, and the team."
      : "You'll have view-only access to the inventory dashboard.";
  const subject = "You're invited to the Lillie & Lee inventory dashboard";

  const html = `<!doctype html><html><body style="margin:0;background:#f4f5f3;font-family:Arial,Helvetica,sans-serif;color:#161d17">
  <div style="max-width:560px;margin:0 auto;padding:24px">
    <div style="border-radius:14px;overflow:hidden;border:1px solid #e3e6e1;background:#fff">
      <div style="background:${BRAND};padding:20px 24px">
        <div style="color:#fff;font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.85">Lillie &amp; Lee · Inventory</div>
        <div style="color:#fff;font-size:20px;font-weight:700;margin-top:4px">You've been invited</div>
      </div>
      <div style="padding:20px 24px">
        <p style="font-size:15px;line-height:1.5;margin:0 0 12px">
          You've been invited to the Lillie &amp; Lee inventory dashboard as
          <span style="display:inline-block;background:#eef2ee;color:${BRAND};font-size:13px;font-weight:700;border-radius:999px;padding:2px 10px">${roleLabel}</span>.
        </p>
        <p style="font-size:14px;line-height:1.5;color:#4b554c;margin:0 0 20px">${access}</p>
        <a href="${inviteUrl}" style="display:inline-block;background:${BRAND};color:#fff;text-decoration:none;font-size:15px;font-weight:600;border-radius:10px;padding:12px 20px">Accept invite &amp; set your password →</a>
        <p style="font-size:12px;line-height:1.5;color:#6b7280;margin:20px 0 0">
          If the button doesn't work, copy this link into your browser:<br />
          <a href="${inviteUrl}" style="color:${BRAND};word-break:break-all">${inviteUrl}</a>
        </p>
        <p style="font-size:12px;line-height:1.5;color:#9aa39b;margin:14px 0 0">
          This invite link can be used once and expires after a short time. If it's expired, ask an admin to re-invite you. If you weren't expecting this, you can ignore this email.
        </p>
      </div>
    </div>
    <div style="text-align:center;font-size:11px;color:#9aa39b;margin-top:14px">Lillie &amp; Lee · automated inventory system</div>
  </div></body></html>`;

  return { subject, html };
}
