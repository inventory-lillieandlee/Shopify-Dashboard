import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PREFETCH-SAFE invite / magic-link confirmation.
 *
 * Supabase's secure flow delivers a one-time `token_hash` + `type` in the email link.
 * Email clients and security scanners (Gmail, Outlook Safe Links, …) routinely PREFETCH
 * links with a GET — which would silently consume the one-time token before the human
 * clicks, producing a spurious "verify_failed".
 *
 * So GET never verifies: it renders a tiny one-click interstitial. The actual
 * verifyOtp runs on POST (only a real click reaches it), which sets the session cookie
 * on the redirect to /set-password. Invite emails point here:
 *   {SiteURL}/auth/confirm?token_hash=…&type=invite&redirect_to=/set-password
 */

function sanitizeRedirect(raw: string | null | undefined): string {
  // Same-origin relative paths only (no open redirect).
  return raw && raw.startsWith("/") ? raw : "/";
}

function escAttr(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const redirect_to = sanitizeRedirect(searchParams.get("redirect_to"));

  if (!token_hash || !type) {
    return NextResponse.redirect(new URL("/login?error=invalid_link", origin));
  }

  const isInvite = type === "invite";
  const heading = isInvite ? "Accept your invitation" : "Confirm your sign-in";
  const blurb = isInvite
    ? "You're one step away from the Lillie & Lee inventory dashboard. Continue to set your password."
    : "Continue to finish signing in to the Lillie & Lee inventory dashboard.";
  const cta = isInvite ? "Continue & set password" : "Continue";

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>${escAttr(heading)} · Lillie & Lee</title>
<style>
  *{box-sizing:border-box} body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
    background:linear-gradient(180deg,#f6f4ec,#eef1ea);font-family:Arial,Helvetica,sans-serif;color:#161d17;padding:24px}
  .card{width:100%;max-width:400px;background:#fff;border:1px solid #e3e6e1;border-radius:18px;
    box-shadow:0 8px 30px rgba(20,29,23,.08);padding:28px}
  .eyebrow{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#6b7280}
  h1{font-size:22px;margin:6px 0 8px;color:#283c2c}
  p{font-size:14px;line-height:1.5;color:#4b554c;margin:0 0 20px}
  button{width:100%;border:0;cursor:pointer;background:#283c2c;color:#fff;font-size:15px;font-weight:600;
    border-radius:10px;padding:12px 16px}
  button:hover{opacity:.92} button:disabled{opacity:.6;cursor:default}
  .foot{margin-top:14px;text-align:center;font-size:11px;color:#9aa39b}
</style></head><body>
  <form class="card" method="POST" action="/auth/confirm">
    <input type="hidden" name="token_hash" value="${escAttr(token_hash)}" />
    <input type="hidden" name="type" value="${escAttr(type)}" />
    <input type="hidden" name="redirect_to" value="${escAttr(redirect_to)}" />
    <div class="eyebrow">Lillie &amp; Lee · Inventory</div>
    <h1>${escAttr(heading)}</h1>
    <p>${escAttr(blurb)}</p>
    <button type="submit" id="go">${escAttr(cta)}</button>
    <div class="foot">For your security this link can be used once.</div>
  </form>
</body></html>`;

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function POST(request: NextRequest) {
  const origin = new URL(request.url).origin;
  const form = await request.formData();
  const token_hash = String(form.get("token_hash") ?? "");
  const type = String(form.get("type") ?? "") as EmailOtpType;
  const redirect_to = sanitizeRedirect(String(form.get("redirect_to") ?? "/"));

  if (!token_hash || !type) {
    return NextResponse.redirect(new URL("/login?error=invalid_link", origin), { status: 303 });
  }

  // 303 so the browser follows with a GET to the destination.
  const response = NextResponse.redirect(new URL(redirect_to, origin), { status: 303 });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const { error } = await supabase.auth.verifyOtp({ type, token_hash });
  if (error) {
    return NextResponse.redirect(new URL("/login?error=verify_failed", origin), { status: 303 });
  }
  return response;
}
