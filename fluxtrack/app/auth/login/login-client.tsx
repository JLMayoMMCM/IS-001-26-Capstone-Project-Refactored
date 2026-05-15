"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ROLES,
  ROLE_LABEL,
  ROLE_ACCENT,
  DEMO_COOKIE_NAME,
  roleHomePath,
  type Role,
} from "@/lib/auth/config";
import {
  LOGIN_BG_SRC,
  MMCM_X_ASU_LOGO_SRC,
  SHIELD_SRC,
} from "@/components/brand/logo";

const ROLE_DESC: Record<Role, string> = {
  faculty: "Check in to classes, request extensions, file disputes",
  ifo_admin: "Live room map, force-end sessions, manage bookings",
  checker: "Walk floor checklist, verify or flag sessions",
  guard: "Floor room status, acknowledge assist requests",
  hr_admin: "Attendance records, payroll periods, exports",
  system_admin: "Provision users, settings, audit log, jobs",
};

// Client-side login form. The `demoMode` value is determined on the server
// by the `page.tsx` wrapper and passed in as a prop — we deliberately do not
// read process.env.NEXT_PUBLIC_DEMO_MODE here because NEXT_PUBLIC_* values
// are inlined into the client bundle at build time and would survive .env
// edits, causing a split-brain state between server and client.
export default function LoginClient({ demoMode }: { demoMode: boolean }) {
  const router = useRouter();
  const search = useSearchParams();
  const errorMsg = search.get("error");
  const [signingIn, setSigningIn] = useState<Role | null>(null);

  function pickRole(role: Role) {
    setSigningIn(role);
    document.cookie = `${DEMO_COOKIE_NAME}=${role}; path=/; max-age=${60 * 60 * 24 * 365}`;
    const redirectTo = search.get("redirect") ?? roleHomePath[role];
    router.push(redirectTo);
  }

  return (
    <div className="min-h-screen w-full grid grid-cols-1 lg:grid-cols-[1.05fr_1fr]">
      {/* Left: brand panel (hidden on mobile) */}
      <aside
        className="relative hidden lg:block overflow-hidden text-white"
        aria-hidden
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={LOGIN_BG_SRC}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, rgba(15,23,42,0.0) 0%, rgba(15,23,42,0.05) 45%, rgba(15,23,42,0.55) 80%, rgba(15,23,42,0.85) 100%)",
          }}
        />
        <div className="relative h-full flex flex-col p-12">
          {/* Top-left MMCM lock-up removed per design — the brand mark now
              lives on the right-hand sign-in panel only. The hero copy below
              still anchors to the bottom of the photo. */}

          <div className="mt-auto max-w-md space-y-4 text-white drop-shadow-[0_2px_8px_rgba(15,23,42,0.6)]">
            <h1 className="text-4xl font-semibold leading-tight">FluxTrack</h1>
            <p className="text-sm opacity-95">
              Faculty Monitoring &amp; Course Management — live attendance, modality
              compliance, and payroll evidence in one place.
            </p>
            <ul className="text-xs opacity-90 space-y-1 list-disc list-inside">
              <li>Realtime room map across every floor</li>
              <li>Class-modality verified with photo + WLAN + Teams</li>
              <li>Audit-grade attendance for HR payroll exports</li>
            </ul>
          </div>

          <div className="mt-8 text-[10px] uppercase tracking-widest text-white/70">
            v6.0 · {demoMode ? "Demo Build" : "Production"}
          </div>
        </div>
      </aside>

      {/* Right: form panel */}
      <main className="flex items-center justify-center px-4 py-10 bg-slate-50">
        <div className="w-full max-w-md">
          {/* Mobile header */}
          <div className="lg:hidden flex items-center gap-3 mb-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={SHIELD_SRC} alt="MMCM" width={36} height={34} />
            <div>
              <div className="text-base font-semibold text-slate-900">FluxTrack</div>
              <div className="text-[10px] uppercase tracking-wide text-slate-500">MMCM</div>
            </div>
          </div>

          {/* Institutional lock-up — MMCM × ASU partnership logo, centred
              above the sign-in card. Hidden on mobile (the shield + wordmark
              header above already covers that surface). */}
          <div className="hidden lg:flex justify-center mb-8">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={MMCM_X_ASU_LOGO_SRC}
              alt="Mapúa Malayan Colleges Mindanao × Arizona State University"
              style={{ height: 200, width: "auto", display: "block" }}
            />
          </div>

          <div className="rounded-2xl bg-white shadow-lg border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-100">
              <h2 className="text-lg font-semibold text-slate-900">Sign in</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {demoMode
                  ? "Demo build — pick a role tile to enter."
                  : "Use your MMCM Google account to continue."}
              </p>
              {demoMode ? (
                <span className="inline-block mt-2 text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                  Demo Mode
                </span>
              ) : (
                <span className="inline-block mt-2 text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">
                  Production
                </span>
              )}
            </div>

            {errorMsg && (
              <div className="px-6 pt-4">
                <div className="text-xs px-3 py-2 rounded-md bg-rose-50 border border-rose-200 text-rose-700">
                  {decodeURIComponent(errorMsg)}
                </div>
              </div>
            )}

            {demoMode ? (
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {ROLES.map((role) => (
                  <button
                    key={role}
                    onClick={() => pickRole(role)}
                    disabled={signingIn !== null}
                    className="text-left rounded-xl border border-slate-200 p-3 hover:border-slate-300 hover:shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ borderLeftWidth: 3, borderLeftColor: ROLE_ACCENT[role] }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium text-slate-900">{ROLE_LABEL[role]}</div>
                      {signingIn === role && (
                        <span className="text-[10px] text-slate-400">Loading…</span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5 leading-tight">
                      {ROLE_DESC[role]}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="p-6 space-y-3">
                <a
                  href={`/apis/auth/google${search.get("redirect") ? `?next=${encodeURIComponent(search.get("redirect")!)}` : ""}`}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
                    <path
                      fill="#fff"
                      d="M21.6 12.227c0-.671-.06-1.317-.172-1.937H12v3.665h5.405a4.62 4.62 0 0 1-2.005 3.03v2.523h3.244c1.898-1.748 2.992-4.323 2.992-7.281Z"
                    />
                    <path
                      fill="#fff"
                      opacity=".7"
                      d="M12 21.6c2.7 0 4.965-.895 6.62-2.422l-3.244-2.522c-.9.604-2.05.961-3.376.961-2.594 0-4.79-1.752-5.575-4.105H3.078v2.578A9.6 9.6 0 0 0 12 21.6Z"
                    />
                  </svg>
                  Continue with Google
                </a>
                <div className="text-[10px] text-slate-500 text-center">
                  Restricted to <span className="font-mono">@mmcm.edu.ph</span> accounts.
                </div>
              </div>
            )}

            <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/60 text-[10px] text-slate-500 flex items-center justify-between">
              <span>FluxTrack v6.0</span>
              <span className="font-mono">
                NEXT_PUBLIC_DEMO_MODE={demoMode ? "true" : "false"}
              </span>
            </div>
          </div>

          {/* Bottom MMCM wordmark removed per design — the partnership lock-up
              above the card is now the only institutional mark on this page. */}
        </div>
      </main>
    </div>
  );
}
