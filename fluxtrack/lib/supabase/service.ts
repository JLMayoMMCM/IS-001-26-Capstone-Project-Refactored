import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { supabaseConfig } from "./config";

// Service-role client — bypasses RLS. ONLY use server-side (route handlers,
// edge functions, server components). Never import in a "use client" file.
// The URL and key are resolved at call-time, so flipping NEXT_PUBLIC_DEMO_MODE
// and restarting the server is sufficient to switch projects.
export function createServiceClient() {
  const cfg = supabaseConfig();
  return createClient<Database>(cfg.url, cfg.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
