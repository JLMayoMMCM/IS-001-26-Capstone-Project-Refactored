import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./types";
import { supabaseConfig } from "./config";
import { isDemoMode } from "@/lib/auth/config";
import { createServiceClient } from "./service";

export async function createClient() {
  // Demo mode has no real Supabase Auth session — the operator's identity is
  // pinned by the `fluxtrack_demo_role` / `fluxtrack_demo_user_id` cookies and
  // resolved via the service client in lib/auth/server.ts. If a route handler
  // queried the database through the SSR auth-cookie client here, `auth.uid()`
  // would be NULL inside Postgres and every RLS-gated table would return zero
  // rows (faculty schedules empty, sessions empty, notifications empty, …).
  //
  // The fix is to short-circuit to the service-role client whenever demo mode
  // is on. RLS is bypassed wholesale, and each route handler is responsible
  // for any role-based filtering it still needs (faculty seeing only their
  // own sessions, etc). The `requireRole()` checks in /lib/auth/get-session
  // already enforce the *coarse* access; the per-row filters live in the
  // route handlers themselves (see /apis/schedules and /apis/sessions).
  if (isDemoMode()) {
    return createServiceClient();
  }

  const cookieStore = await cookies();
  const cfg = supabaseConfig();

  return createServerClient<Database>(cfg.url, cfg.publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // The setAll method was called from a Server Component; ignored.
        }
      },
    },
  });
}
