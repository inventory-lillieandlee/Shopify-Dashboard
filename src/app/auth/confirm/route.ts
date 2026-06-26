import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * THE PKCE FIX — server-side invite / magic-link confirmation.
 *
 * Supabase's secure flow delivers a `token_hash` + `type` in the email link
 * (NOT a client-side `#access_token` hash fragment). We verify it server-side
 * with verifyOtp, which sets the session cookie on the redirect response. The
 * invite email template must point here:
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&redirect_to=/set-password
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  // Only allow same-origin relative redirects (no open-redirect).
  const rawRedirect = searchParams.get("redirect_to") || "/";
  const redirectTo = rawRedirect.startsWith("/") ? rawRedirect : "/";

  if (!token_hash || !type) {
    return NextResponse.redirect(new URL("/login?error=invalid_link", origin));
  }

  const response = NextResponse.redirect(new URL(redirectTo, origin));
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
    return NextResponse.redirect(new URL("/login?error=verify_failed", origin));
  }
  return response;
}
