import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/auth/config";

// GET /apis/auth/google?next=/some/path
// Kicks off the Supabase-managed Google OAuth flow. Returns a 302 to Google's
// consent screen; Google → /apis/auth/callback?code=... after the user signs in.
export async function GET(request: NextRequest) {
  const { origin, searchParams } = request.nextUrl;

  // Refuse in demo mode — keep the surface obvious so a misconfigured deploy
  // doesn't accidentally pop a Google flow during a capstone demo.
  if (isDemoMode()) {
    return NextResponse.redirect(
      `${origin}/auth/login?error=${encodeURIComponent("Demo mode is on; Google sign-in is disabled.")}`
    );
  }

  const next = searchParams.get("next") ?? "/";
  const supabase = await createClient();

  const callback = `${origin}/apis/auth/callback?next=${encodeURIComponent(next)}`;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callback,
      queryParams: { access_type: "offline", prompt: "consent" },
    },
  });

  if (error || !data?.url) {
    return NextResponse.redirect(
      `${origin}/auth/login?error=${encodeURIComponent(error?.message ?? "Failed to start Google OAuth")}`
    );
  }

  return NextResponse.redirect(data.url);
}
