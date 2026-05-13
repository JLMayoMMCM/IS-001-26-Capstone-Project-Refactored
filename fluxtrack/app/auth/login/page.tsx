import { Suspense } from "react";
import { isDemoMode } from "@/lib/auth/config";
import LoginClient from "./login-client";

// Server component. Resolves `demoMode` at request time from
// process.env.NEXT_PUBLIC_DEMO_MODE and hands it to the client component as a
// prop. This makes the value runtime-fresh: editing .env.local and restarting
// the server is enough; we don't depend on Turbopack invalidating a stale
// client bundle that has the value inlined.
export default function LoginPage() {
  const demoMode = isDemoMode();
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500 text-sm">
          Loading…
        </div>
      }
    >
      <LoginClient demoMode={demoMode} />
    </Suspense>
  );
}

// Don't pre-render at build time — re-read the env value on every visit so a
// `.env.local` flip + server restart is enough to switch behavior.
export const dynamic = "force-dynamic";
