import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { DEMO_COOKIE_NAME, ROLES, rolesForPath, roleHomePath, type Role } from "@/lib/auth/config";

const PUBLIC_PATHS = ["/", "/auth/login", "/apis/test-connection", "/apis/auth/callback", "/apis/auth/signout"];

// Anything served straight out of /public/ — these never require auth. The
// matcher below ALSO excludes them at the edge so the middleware never runs
// for these requests in the first place, but this is defense-in-depth in case
// the matcher regex misses a case.
const STATIC_PREFIXES = ["/_next", "/favicon", "/brand/", "/sw.js"];
const STATIC_EXT_RE = /\.(?:png|jpg|jpeg|gif|svg|webp|ico|avif|woff2?|ttf|otf|eot|map|css|js|json|txt|xml|pdf)$/i;

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  if (STATIC_PREFIXES.some((p) => pathname.startsWith(p))) return true;
  if (STATIC_EXT_RE.test(pathname)) return true;
  if (pathname.startsWith("/apis/")) return true;
  return false;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  let role: Role | null = null;

  if (demoMode) {
    const raw = request.cookies.get(DEMO_COOKIE_NAME)?.value;
    if (raw && (ROLES as string[]).includes(raw)) role = raw as Role;

    if (!role) {
      const url = request.nextUrl.clone();
      url.pathname = "/auth/login";
      url.searchParams.set("redirect", pathname);
      return NextResponse.redirect(url);
    }

    // Per-role path guard (only meaningful for demo, where the role is in
    // the cookie). In production mode the user_role custom claim isn't
    // guaranteed to be on the JWT, so page-level requireRole() does the check.
    const allowed = rolesForPath(pathname);
    if (allowed && !allowed.includes(role)) {
      const url = request.nextUrl.clone();
      url.pathname = roleHomePath(role);
      return NextResponse.redirect(url);
    }

    return NextResponse.next();
  }

  // ─── Production mode: only check that there is a Supabase session ───────
  // We do NOT enforce role at the edge because:
  //  (a) the user_role custom claim requires a JWT hook that isn't guaranteed
  //      to be configured on every deploy, and
  //  (b) every server page already calls getCurrentUser() / requireRole()
  //      which does the canonical lookup against public.users.
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );
  const { data } = await supabase.auth.getClaims();
  const sub = (data?.claims as { sub?: string } | null)?.sub;
  if (!sub) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }
  return response;
}

// Skip the middleware entirely for Next.js internals, the favicon, and the
// /brand/ prefix. We deliberately keep the matcher regex simple — path-to-regexp
// (which Next compiles matchers with) does not support arbitrary lookaheads
// reliably. The `isPublic()` guard at the top of `proxy()` handles every other
// static-file case (file-extension sniff).
export const config = {
  matcher: ["/((?!_next/|favicon\\.ico|brand/|sw\\.js).*)"],
};
