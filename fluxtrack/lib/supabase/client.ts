import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";
import { supabaseConfig } from "./config";

export function createClient() {
  const cfg = supabaseConfig();
  return createBrowserClient<Database>(cfg.url, cfg.publishableKey);
}
