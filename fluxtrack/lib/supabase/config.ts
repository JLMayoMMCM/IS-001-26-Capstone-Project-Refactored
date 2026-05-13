import { isDemoMode } from "@/lib/auth/config";

// Two-project setup: when NEXT_PUBLIC_DEMO_MODE=true we point at the seeded
// demo Supabase project; when it's false we point at the live MMCM project.
//
// Env precedence per slot (URL / publishable key / service-role key):
//
//   1. The mode-specific var       (NEXT_PUBLIC_SUPABASE_DEMO_URL, …_LIVE_URL)
//   2. The legacy single-project var (NEXT_PUBLIC_SUPABASE_URL)
//
// This means a deploy that hasn't migrated to the new naming still works —
// only the legacy vars are read and they apply to both modes.
//
// IMPORTANT — NEXT_PUBLIC_* values are inlined into the client bundle at
// build time. We read them through module-level constants below so the
// bundler always sees the literal `process.env.NEXT_PUBLIC_FOO` expression
// at parse time (which is what the inliner pattern-matches on).

// Hoisted env reads — the bundler statically replaces each `process.env.X`
// expression here at compile time. Doing the reads inside a function would
// also work, but extracting them up here guarantees consistent inlining and
// avoids the bundler dropping a reference if one path through the function
// is never taken in a given build.
const ENV = {
  demoUrl: process.env.NEXT_PUBLIC_SUPABASE_DEMO_URL,
  demoPub: process.env.NEXT_PUBLIC_SUPABASE_DEMO_PUBLISHABLE_KEY,
  demoSrv: process.env.SUPABASE_DEMO_SERVICE_ROLE_KEY,
  liveUrl: process.env.NEXT_PUBLIC_SUPABASE_LIVE_URL,
  livePub: process.env.NEXT_PUBLIC_SUPABASE_LIVE_PUBLISHABLE_KEY,
  liveSrv: process.env.SUPABASE_LIVE_SERVICE_ROLE_KEY,
  legacyUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  legacyPub: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  legacySrv: process.env.SUPABASE_SERVICE_ROLE_KEY,
} as const;

const IS_BROWSER = typeof window !== "undefined";

function pick(modeVar: string | undefined, legacyVar: string | undefined, slot: string): string {
  const v = (modeVar && modeVar.trim()) || (legacyVar && legacyVar.trim()) || "";
  if (v) return v;
  const msg =
    `Supabase config: ${slot} not configured. ` +
    "Set the *_DEMO_* / *_LIVE_* env vars or the legacy NEXT_PUBLIC_SUPABASE_* fallback in .env.local, " +
    "then restart the dev server so Next.js re-loads them (NEXT_PUBLIC_* values are also re-inlined into the client bundle on restart).";

  // We log the misconfiguration loudly on both server and client so the
  // problem is obvious, but we don't throw — throwing here would 500 every
  // route handler (server) or crash the component tree at mount (browser).
  // supabase-js will surface its own (clearer) error if we hand it an empty
  // URL/key. The slot name in the warning tells the operator exactly which
  // env var needs to be set.
  // eslint-disable-next-line no-console
  (IS_BROWSER ? console.error : console.warn)(`[supabase] ${msg}`);
  return "";
}

export type SupabaseConfig = {
  url: string;
  publishableKey: string;
  serviceRoleKey: string;
  mode: "demo" | "live";
};

// Service-role key is a server-only secret; it MUST NOT be shipped to the
// browser. Skipping the read in the browser is correct behavior, not an
// error — no warning, no spam.
function pickServiceKey(modeVar: string | undefined, legacyVar: string | undefined): string {
  if (IS_BROWSER) return "";
  return pick(modeVar, legacyVar, "SUPABASE_SERVICE_ROLE_KEY");
}

export function supabaseConfig(): SupabaseConfig {
  const demo = isDemoMode();
  if (demo) {
    return {
      url:            pick(ENV.demoUrl, ENV.legacyUrl, "NEXT_PUBLIC_SUPABASE_URL"),
      publishableKey: pick(ENV.demoPub, ENV.legacyPub, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
      serviceRoleKey: pickServiceKey(ENV.demoSrv, ENV.legacySrv),
      mode: "demo",
    };
  }
  return {
    url:            pick(ENV.liveUrl, ENV.legacyUrl, "NEXT_PUBLIC_SUPABASE_URL"),
    publishableKey: pick(ENV.livePub, ENV.legacyPub, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    serviceRoleKey: pickServiceKey(ENV.liveSrv, ENV.legacySrv),
    mode: "live",
  };
}
