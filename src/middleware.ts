import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isPublicPath } from "@/lib/auth/policy";

/**
 * Session-refresh middleware. ONE code path (no AUTH_ENABLED).
 *
 * The dashboard is intentionally OPEN — this middleware does NOT gate or redirect
 * anyone. Its only job is to refresh the Supabase auth cookie on page navigations
 * so a signed-in admin's session stays valid and requireAdmin's cookie path keeps
 * working. Authorization itself lives at the route layer (requireAdmin) and in the
 * UI (write actions 401 when signed out).
 *
 * Public paths are skipped entirely: /api/* self-authorizes and must never be
 * touched (cron has no cookie; a redirect would break it), and /login is the
 * anonymous sign-in page. See isPublicPath.
 */
export async function middleware(request: NextRequest) {
  if (isPublicPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

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

  // Touch the session so @supabase/ssr rotates the cookie when needed. No redirect
  // on the result — an anonymous visitor sees the open dashboard, a signed-in one
  // gets a refreshed cookie.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  // Run on everything EXCEPT Next internals + static asset files (never on _next/static,
  // _next/image, favicon.ico, or image/font files served from /public).
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpe?g|svg|ico|webp|gif|woff2?|ttf)$).*)",
  ],
};
