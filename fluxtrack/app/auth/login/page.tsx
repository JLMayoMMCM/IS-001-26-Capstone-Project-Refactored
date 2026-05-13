"use client";

import { Suspense, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { roleHomePath, type Role } from "@/lib/auth/config";
import BrandLogo from "@/components/layout/brand-logo";

const DEMO_COOKIE_NAME = "fluxtrack_demo_role";

const DEMO_ROLES: Array<{
  role: Role;
  label: string;
  desc: string;
  color: string;
  initials: string;
}> = [
  { role: "faculty",      label: "Faculty",      desc: "Check in to classes, request extensions, file disputes",   color: "#114b9f", initials: "FC" },
  { role: "ifo_admin",    label: "IFO Admin",    desc: "Live room map, force-end sessions, manage bookings",         color: "#7c3aed", initials: "IF" },
  { role: "checker",      label: "Checker",      desc: "Walk floor checklist, verify or flag sessions",              color: "#0891b2", initials: "CK" },
  { role: "guard",        label: "Guard",        desc: "Floor room status, acknowledge assist requests",             color: "#d97706", initials: "GD" },
  { role: "hr_admin",     label: "HR Admin",     desc: "Attendance records, payroll periods, exports",               color: "#16a34a", initials: "HR" },
  { role: "system_admin", label: "System Admin", desc: "Provision users, manage roles",                              color: "#475569", initials: "SA" },
];

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500 text-sm">Loading…</div>}>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-white">
      {/* ── LEFT: hero panel — campus photo with dark overlay ─────────────── */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        {/* Campus building photo */}
        <Image
          src="/brand/login-bg.jpg"
          alt="Mapúa Malayan Colleges Mindanao campus"
          fill
          priority
          unoptimized
          sizes="50vw"
          className="object-cover"
        />

        {/* Brand-toned overlay — keeps the photo readable AND text legible */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(135deg, rgba(0,28,67,0.86) 0%, rgba(0,28,67,0.72) 45%, rgba(17,75,159,0.62) 100%)",
          }}
        />

        {/* Subtle grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.05] pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.4) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />

        {/* Hero content */}
        <div className="relative z-10 flex flex-col justify-between p-10 xl:p-14 w-full text-white fade-up">
          {/* Top: product wordmark */}
          <div className="flex items-center gap-3">
            <BrandLogo variant="shield-only" size={48} />
            <div>
              <p className="font-bold text-[20px] tracking-tight leading-none">FluxTrack</p>
              <p className="text-[11px] text-blue-200 tracking-wider mt-1">FACULTY ATTENDANCE PLATFORM</p>
            </div>
          </div>

          {/* Middle: title cluster, anchored upper-third (not centered)
              so it doesn't fight the campus photo's vanishing point */}
          <div className="max-w-xl mt-12 xl:mt-20">
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/15 backdrop-blur-sm text-[11px] font-bold tracking-wider uppercase text-blue-200 w-fit mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 ambient-pulse" />
              Live · v5.0
            </span>
            <h2 className="text-[44px] xl:text-[52px] font-bold leading-[1.05] tracking-tight mb-5">
              Faculty Attendance &amp;<br />
              <span
                className="bg-clip-text text-transparent"
                style={{ backgroundImage: "linear-gradient(135deg, #ffffff 0%, #93c5fd 100%)" }}
              >
                Facility Monitoring
              </span>
            </h2>
            <p className="text-[15px] text-blue-100/90 leading-relaxed mb-7 max-w-md">
              Real-time room occupancy, WLAN-verified check-ins, and modality-aware attendance for Mapúa Malayan Colleges Mindanao.
            </p>
            <div className="flex flex-wrap gap-2.5">
              {[
                { label: "WLAN Geo-fenced", icon: "shield" },
                { label: "Offline-First", icon: "cloud" },
                { label: "Multimodal", icon: "layers" },
              ].map((tag) => (
                <span
                  key={tag.label}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/10 border border-white/15 backdrop-blur-sm text-[12px] font-semibold text-white"
                >
                  <FeatureIcon name={tag.icon} />
                  {tag.label}
                </span>
              ))}
            </div>
          </div>

          {/* Bottom: legal */}
          <div className="flex items-center justify-between text-[11px] text-white/55">
            <span>© 2026 Faculty Attendance Monitoring System</span>
            <span className="font-mono">v1.0</span>
          </div>
        </div>
      </div>

      {/* ── RIGHT: auth panel ────────────────────────────────────────────── */}
      <div className="flex-1 lg:w-1/2 flex flex-col bg-white relative overflow-y-auto">
        <header className="flex items-center justify-between px-6 sm:px-10 lg:px-12 pt-6 lg:pt-8">
          <div className="lg:hidden">
            <BrandLogo variant="wordmark" size={32} />
          </div>
          {/* Desktop: real Mapúa MCM full logo, top-right */}
          <div className="hidden lg:flex ml-auto">
            <Image
              src="/brand/mmcm-logo-full.png"
              alt="Mapúa Malayan Colleges Mindanao"
              width={110}
              height={140}
              priority
              unoptimized
              className="h-auto w-[88px] xl:w-[100px]"
            />
          </div>
        </header>

        <main className="flex-1 flex items-start lg:items-center justify-center px-6 sm:px-10 lg:px-12 py-6 lg:py-10">
          <div className="w-full max-w-md fade-up">
            {isDemoMode ? <DemoRolePicker /> : <AuthForm />}
          </div>
        </main>

        <footer className="px-6 sm:px-10 lg:px-12 pb-6 lg:pb-8 flex items-center justify-center gap-3 text-[11px] text-slate-400">
          <button className="hover:text-slate-700 transition-colors">Privacy Policy</button>
          <span className="text-slate-300">|</span>
          <button className="hover:text-slate-700 transition-colors">Terms of Use</button>
          <span className="text-slate-300">|</span>
          <button className="hover:text-slate-700 transition-colors">Help &amp; Support</button>
        </footer>
      </div>
    </div>
  );
}

function FeatureIcon({ name }: { name: string }) {
  const props = {
    width: 13,
    height: 13,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
  };
  if (name === "shield") {
    return (
      <svg {...props}>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    );
  }
  if (name === "cloud") {
    return (
      <svg {...props}>
        <path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z" />
      </svg>
    );
  }
  return (
    <svg {...props}>
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  );
}

// ─── Demo role picker ──────────────────────────────────────────────────────

function DemoRolePicker() {
  function pickRole(role: Role) {
    document.cookie = `${DEMO_COOKIE_NAME}=${role}; path=/; max-age=86400; SameSite=Lax`;
    window.location.href = roleHomePath[role];
  }

  return (
    <div className="text-center">
      <div className="mb-8 flex flex-col items-center">
        <p className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-[11px] font-bold text-amber-800 uppercase tracking-wider mb-5">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
          Demo Mode
        </p>
        <h1 className="text-display text-[#001c43] tracking-tight">Welcome back</h1>
        <p className="text-[14px] text-slate-500 mt-2 max-w-sm">
          Pick a role to enter the demo. Each role uses a seeded account.
        </p>
      </div>

      <div className="space-y-2.5 text-left">
        {DEMO_ROLES.map((r) => (
          <button
            key={r.role}
            onClick={() => pickRole(r.role)}
            className="w-full flex items-center gap-3.5 px-4 py-3.5 min-h-[60px] rounded-xl border border-slate-200 bg-white hover:border-[#001c43] hover:shadow-md hover:-translate-y-0.5 transition-all group text-left"
          >
            <span
              className="w-12 h-12 rounded-xl text-white text-[12px] font-bold flex items-center justify-center shrink-0 shadow-sm"
              style={{
                background: `linear-gradient(135deg, ${r.color} 0%, ${r.color}cc 100%)`,
              }}
            >
              {r.initials}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[14px] font-bold text-[#001c43] tracking-tight">{r.label}</span>
              <span className="block text-[11.5px] text-slate-500 leading-snug truncate">
                {r.desc}
              </span>
            </span>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              className="text-slate-300 group-hover:text-[#001c43] group-hover:translate-x-0.5 transition-all shrink-0"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        ))}
      </div>

      <p className="mt-7 text-[11px] text-slate-400 text-center">
        Set{" "}
        <code className="px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 font-mono text-[10.5px]">
          NEXT_PUBLIC_DEMO_MODE=false
        </code>{" "}
        to restore real sign-in.
      </p>
      <div className="mt-3 text-center">
        <Link href="/" className="text-[11px] text-slate-400 hover:text-slate-700 transition-colors">
          ← Home
        </Link>
      </div>
    </div>
  );
}

// ─── Real auth form ────────────────────────────────────────────────────────

function AuthForm() {
  const params = useSearchParams();
  const next = params.get("next");
  const errorParam = params.get("error");

  const [loading, setLoading] = useState(false);
  const [showCredentials, setShowCredentials] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [credErr, setCredErr] = useState<string | null>(null);

  async function handleGoogle() {
    setLoading(true);
    const supabase = createClient();
    const redirectTo = `${window.location.origin}/api/auth/callback${next ? `?next=${encodeURIComponent(next)}` : ""}`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo, scopes: "openid profile email" },
    });
    if (error) {
      setCredErr(error.message);
      setLoading(false);
    }
  }

  async function handleCredentials(e: React.FormEvent) {
    e.preventDefault();
    setCredErr(null);
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setCredErr(error.message);
      setLoading(false);
      return;
    }
    window.location.href = next ?? "/";
  }

  return (
    <div className="text-center">
      <div className="mb-8">
        <h1 className="text-display text-[#001c43] tracking-tight">Welcome back</h1>
        <p className="text-[14px] text-slate-500 mt-2">
          Sign in with your institutional account to continue
        </p>
      </div>

      {(credErr || errorParam) && (
        <div className="mb-4 px-3.5 py-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 text-left">
          <p className="font-bold">Sign-in failed</p>
          <p className="mt-0.5 break-words">{credErr ?? `Error: ${errorParam}`}</p>
        </div>
      )}

      <button
        onClick={handleGoogle}
        disabled={loading}
        className="w-full flex items-center justify-center gap-3 py-4 px-5 min-h-[52px] rounded-xl border border-slate-200 bg-white hover:bg-slate-50 hover:shadow-md text-slate-800 font-bold text-[14px] transition-all shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="3" width="8" height="8" fill="#f25022" />
          <rect x="13" y="3" width="8" height="8" fill="#7fba00" />
          <rect x="3" y="13" width="8" height="8" fill="#00a4ef" />
          <rect x="13" y="13" width="8" height="8" fill="#ffb900" />
        </svg>
        <span>{loading ? "Redirecting…" : "Continue with Microsoft Account"}</span>
      </button>

      <p className="text-[11px] text-center text-slate-400 mt-2">
        Use your institutional Office 365
      </p>

      <div className="flex items-center gap-3 my-6">
        <div className="flex-1 h-px bg-slate-200" />
        <span className="text-[11px] text-slate-400 whitespace-nowrap font-medium">
          or sign in with credentials
        </span>
        <div className="flex-1 h-px bg-slate-200" />
      </div>

      {!showCredentials ? (
        <button
          onClick={() => setShowCredentials(true)}
          className="w-full flex items-center justify-center gap-2 py-3.5 px-5 min-h-[48px] rounded-xl border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 text-slate-700 font-bold text-[14px] transition-all"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
            <polyline points="22,6 12,13 2,6" />
          </svg>
          Use email &amp; password
        </button>
      ) : (
        <form className="space-y-3 text-left" onSubmit={handleCredentials}>
          <div>
            <label className="text-overline mb-1.5 block">Institutional Email</label>
            <input
              type="email"
              placeholder="firstname.lastname@mmcm.edu.ph"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3.5 rounded-xl border border-slate-200 text-[14px] text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#114b9f] focus-ring transition-shadow"
            />
          </div>
          <div>
            <label className="text-overline mb-1.5 block">Password</label>
            <input
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3.5 rounded-xl border border-slate-200 text-[14px] text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#114b9f] focus-ring transition-shadow"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full py-4 min-h-[52px] rounded-xl text-[14px] disabled:opacity-50"
          >
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>
      )}
    </div>
  );
}
