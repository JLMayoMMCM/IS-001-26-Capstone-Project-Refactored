import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

// Service-role client — bypasses RLS. ONLY use server-side (route handlers,
// edge functions, server components). Never import in a "use client" file.
export function createServiceClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );
}
