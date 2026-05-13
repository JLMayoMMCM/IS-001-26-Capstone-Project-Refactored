"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  DEMO_COOKIE_NAME,
  ROLES,
  ROLE_LABEL,
  ROLE_ACCENT,
  roleHomePath,
  isDemoMode,
  type Role,
} from "@/lib/auth/config";
import { ROLE_NAV } from "@/lib/auth/nav";
import { Wordmark } from "@/components/brand/logo";
import LiveClock from "@/components/topbar/live-clock";
import NotificationBell from "@/components/topbar/notification-bell";

const COLLAPSED_KEY = "fluxtrack_sidebar_collapsed";

export default function AppShell({
  role,
  userName,
  children,
}: {
  role: Role;
  userName?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const demo = isDemoMode();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate collapsed state from localStorage; persist on toggle.
  useEffect(() => {
    try {
      const v = localStorage.getItem(COLLAPSED_KEY);
      setCollapsed(v === "1");
    } catch {}
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
    } catch {}
  }, [collapsed, hydrated]);

  // Close mobile drawer on navigation.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  function switchRole(next: Role) {
    if (!demo || next === role) return;
    document.cookie = `${DEMO_COOKIE_NAME}=${next}; path=/; max-age=${60 * 60 * 24 * 365}`;
    router.push(roleHomePath[next]);
    router.refresh();
  }

  async function signOut() {
    await fetch("/apis/auth/signout", { method: "POST" });
    document.cookie = `${DEMO_COOKIE_NAME}=; path=/; max-age=0`;
    router.push("/auth/login");
  }

  const links = ROLE_NAV[role] ?? [];
  const accent = ROLE_ACCENT[role];
  const sidebarWidth = collapsed ? 64 : 240;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Sidebar — desktop */}
      <aside
        className="hidden md:flex fixed inset-y-0 left-0 z-30 border-r border-slate-200 bg-white flex-col transition-all duration-200"
        style={{ width: sidebarWidth }}
        aria-label="Primary navigation"
      >
        <div
          className="h-1 w-full shrink-0"
          style={{ background: accent }}
          aria-hidden
        />
        <div className="flex items-center gap-2 px-3 h-14 border-b border-slate-100">
          <Link href={roleHomePath[role]} className="flex-1 min-w-0">
            <Wordmark size={28} role={role} subtitle={ROLE_LABEL[role]} collapsed={collapsed} />
          </Link>
          <button
            onClick={() => setCollapsed((v) => !v)}
            className="w-8 h-8 rounded-md hover:bg-slate-100 inline-flex items-center justify-center text-slate-500"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            title={collapsed ? "Expand" : "Collapse"}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {collapsed ? (
                <polyline points="9 18 15 12 9 6" />
              ) : (
                <polyline points="15 18 9 12 15 6" />
              )}
            </svg>
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {links.map((l) => {
            const active = pathname === l.href || pathname.startsWith(l.href + "/");
            return (
              <Link
                key={l.href}
                href={l.href}
                title={collapsed ? l.label : undefined}
                className={`flex items-center gap-2 rounded-md px-2.5 py-2 text-sm transition ${
                  active
                    ? "bg-slate-900 text-white"
                    : "text-slate-700 hover:bg-slate-100"
                } ${collapsed ? "justify-center" : ""}`}
              >
                <span className="shrink-0">{l.icon}</span>
                {!collapsed && <span className="truncate">{l.label}</span>}
              </Link>
            );
          })}
        </nav>

        {!collapsed && (
          <div className="border-t border-slate-100 p-3 text-[10px] text-slate-400">
            FluxTrack · MMCM
          </div>
        )}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative w-64 bg-white border-r border-slate-200 flex flex-col">
            <div
              className="h-1 w-full shrink-0"
              style={{ background: accent }}
              aria-hidden
            />
            <div className="flex items-center gap-2 px-3 h-14 border-b border-slate-100">
              <Wordmark size={28} role={role} subtitle={ROLE_LABEL[role]} />
              <button
                onClick={() => setMobileOpen(false)}
                className="ml-auto w-8 h-8 rounded-md hover:bg-slate-100 inline-flex items-center justify-center text-slate-500"
                aria-label="Close menu"
              >
                ✕
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
              {links.map((l) => {
                const active = pathname === l.href || pathname.startsWith(l.href + "/");
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    className={`flex items-center gap-2 rounded-md px-2.5 py-2 text-sm transition ${
                      active ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <span className="shrink-0">{l.icon}</span>
                    <span className="truncate">{l.label}</span>
                  </Link>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* Main column. We set --side-w as an inline CSS variable (same value
          on server and client — `hydrated` only flips the value, never a
          server/client branch), and apply md:pl-[var(--side-w)] so the
          padding only kicks in on the desktop breakpoint. Pure CSS, no
          `typeof window` branch — no hydration mismatch. */}
      <div
        className="md:pl-[var(--side-w)] transition-[padding] duration-200"
        style={{ ["--side-w" as never]: `${sidebarWidth}px` }}
      >
          {/* Topbar */}
          <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-slate-200">
            <div className="h-14 px-4 flex items-center gap-3">
              {/* Mobile menu trigger */}
              <button
                onClick={() => setMobileOpen(true)}
                className="md:hidden w-9 h-9 rounded-md hover:bg-slate-100 inline-flex items-center justify-center text-slate-700"
                aria-label="Open menu"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              </button>

              <span
                className="hidden md:inline text-xs px-2 py-0.5 rounded-full text-white font-medium"
                style={{ background: accent }}
              >
                {ROLE_LABEL[role]}
              </span>

              <div className="flex-1" />

              <LiveClock />
              <NotificationBell />

              {demo && (
                <select
                  className="text-xs border border-slate-200 rounded-md px-2 py-1 bg-white"
                  value={role}
                  onChange={(e) => switchRole(e.target.value as Role)}
                  aria-label="Switch demo role"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </select>
              )}

              {userName && (
                <span className="hidden lg:inline text-xs text-slate-500 max-w-32 truncate">
                  {userName}
                </span>
              )}

              <button
                onClick={signOut}
                className="text-xs px-2 py-1 rounded-md border border-slate-200 text-slate-700 hover:bg-slate-100"
              >
                Sign out
              </button>
            </div>
          </header>

          <main>{children}</main>
      </div>
    </div>
  );
}
