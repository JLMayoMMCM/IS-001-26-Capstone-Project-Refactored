import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { roleHomePath, type Role } from "@/lib/auth/config";

/**
 * Supabase OAuth callback handler (production mode only — demo mode skips
 * this entire path because the cookie is set client-side).
 *
 * Google (via Supabase Auth) redirects here with `?code=...` after sign-in.
 * We exchange the code for a session, look up the user's role, and bounce
 * to the appropriate dashboard.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next");
  const errParam = searchParams.get("error_description") ?? searchParams.get("error");

  if (errParam) {
    return NextResponse.redirect(
      `${origin}/auth/login?error=${encodeURIComponent(errParam)}`
    );
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      `${origin}/auth/login?error=${encodeURIComponent(error.message)}`
    );
  }

  // If a `next` URL was preserved, honor it; otherwise route by role
  if (next && next.startsWith("/")) {
    return NextResponse.redirect(`${origin}${next}`);
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(`${origin}/auth/login?error=no_user_after_exchange`);
  }

  // Optional email-domain restriction — uncomment to enforce MMCM accounts only.
  // if (!user.email?.toLowerCase().endsWith("@mmcm.edu.ph")) {
  //   await supabase.auth.signOut();
  //   return NextResponse.redirect(`${origin}/auth/login?error=${encodeURIComponent("Only @mmcm.edu.ph accounts are allowed.")}`);
  // }

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = (profile?.role ?? "faculty") as Role;
  return NextResponse.redirect(`${origin}${roleHomePath[role]}`);
}
