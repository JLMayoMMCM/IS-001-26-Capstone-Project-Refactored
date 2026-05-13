import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { DEMO_COOKIE_NAME, ROLES, rolesForPath, roleHomePath, type Role } from "@/lib/auth/config";

const PUBLIC_PATHS = ["/", "/auth/login", "/apis/test-connection", "/apis/auth/callback", "/apis/auth/signout"];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  // Allow static assets and the apis surface (route handlers handle their own auth)
  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon") || pathname.startsWith("/public")) {
    return true;
  }
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

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|public).*)"],
};
