import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isAuthEnabled, isPublicPath } from "@/lib/auth/policy";

export async function middleware(request: NextRequest) {
  // ── DORMANT: TRUE no-op ───────────────────────────────────────────────────
  // Bail BEFORE constructing any Supabase client or touching cookies. An
  // anonymous, cookieless request must pass through completely untouched — no
  // Set-Cookie, no redirect, no added headers. Production stays public until the
  // operator flips AUTH_ENABLED=true (see the go-live runbook).
  if (!isAuthEnabled()) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  // Auth flow + self-authorizing APIs bypass the gate (matcher already excludes
  // static assets).
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // ── ENABLED: refresh session, gate protected pages ────────────────────────
  const response = NextResponse.next({ request });
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
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("redirect_to", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  // Run on everything except Next internals + static asset files.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpe?g|svg|ico|webp|gif)$).*)"],
};
