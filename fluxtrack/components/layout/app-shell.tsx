"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  DEMO_COOKIE_NAME,
  DEMO_USER_COOKIE_NAME,
  ROLES,
  ROLE_LABEL,
  ROLE_ACCENT,
  roleHomePath,
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
  demoMode,
  children,
}: {
  role: Role;
  userName?: string;
  // The current demo-mode flag, resolved on the server by the role layout and
  // passed in as a prop. We deliberately DON'T read process.env.NEXT_PUBLIC_*
  // inside this client component because NEXT_PUBLIC_* values are inlined at
  // build time and would survive .env.local edits — leading to a split-brain
  // state where the server sees `false` and the client still sees `true`.
  demoMode: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const demo = demoMode;
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
    // Drop any pinned demo user — that ID belongs to the previous role.
    document.cookie = `${DEMO_USER_COOKIE_NAME}=; path=/; max-age=0`;
    router.push(roleHomePath[next]);
    router.refresh();
  }

  async function signOut() {
    await fetch("/apis/auth/signout", { method: "POST" });
    document.cookie = `${DEMO_COOKIE_NAME}=; path=/; max-age=0`;
    document.cookie = `${DEMO_USER_COOKIE_NAME}=; path=/; max-age=0`;
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
          {/* Topbar — sticky, 56px. On phones the role chip, role select,
              account switcher and sign-out collapse into a single ⋯ overflow
              menu so we don't overflow the 375px-wide viewport. */}
          <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-slate-200">
            <div className="h-14 px-3 sm:px-4 flex items-center gap-2 sm:gap-3">
              {/* Mobile menu trigger */}
              <button
                onClick={() => setMobileOpen(true)}
                className="md:hidden w-11 h-11 rounded-lg hover:bg-slate-100 inline-flex items-center justify-center text-slate-700 focus-ring"
                aria-label="Open menu"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              </button>

              <span
                className="hidden md:inline text-[11px] px-2.5 py-1 rounded-full text-white font-bold tracking-wide"
                style={{ background: accent }}
              >
                {ROLE_LABEL[role]}
              </span>

              <div className="flex-1" />

              <LiveClock />
              <NotificationBell />

              {/* Desktop / tablet: inline switchers. */}
              <div className="hidden sm:flex items-center gap-2">
                {demo && (
                  <>
                    <select
                      className="text-[12px] border border-slate-200 rounded-lg px-2 py-1.5 bg-white min-h-[36px] focus-ring"
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
                    <DemoAccountSwitcher role={role} />
                  </>
                )}

                {!demo && userName && (
                  <span className="hidden lg:inline text-[12px] text-slate-500 max-w-32 truncate">
                    {userName}
                  </span>
                )}

                <button
                  onClick={signOut}
                  className="text-[12px] font-medium px-3 py-1.5 min-h-[36px] rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 hover:border-slate-300 transition-colors focus-ring"
                >
                  Sign out
                </button>
              </div>

              {/* Mobile (≤ sm): overflow menu hides switchers + sign-out. */}
              <MobileTopbarMenu
                demo={demo}
                role={role}
                onSwitchRole={switchRole}
                onSignOut={signOut}
              />
            </div>
          </header>

          <main>{children}</main>
      </div>
    </div>
  );
}

function DemoAccountSwitcher({ role }: { role: Role }) {
  const [users, setUsers] = useState<Array<{ id: string; full_name: string; email: string }>>([]);
  const [meId, setMeId] = useState<string>(""); // active user resolved server-side

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch(`/apis/demo/users?role=${role}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : { users: [] })),
      fetch(`/apis/users/me`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : { user: null })),
    ])
      .then(([usersJson, meJson]) => {
        if (!alive) return;
        setUsers((usersJson?.users ?? []) as Array<{ id: string; full_name: string; email: string }>);
        setMeId(meJson?.user?.id ?? "");
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [role]);

  function pickUser(id: string) {
    if (id) {
      document.cookie = `fluxtrack_demo_user_id=${id}; path=/; max-age=${60 * 60 * 24 * 365}`;
    } else {
      document.cookie = `fluxtrack_demo_user_id=; path=/; max-age=0`;
    }
    // Hard reload — `router.refresh()` only re-renders SERVER components,
    // but every page in FluxTrack fetches its user-scoped data in a
    // client-side `useEffect` that runs on mount (see e.g.
    // app/faculty/dashboard/page.tsx:refreshData). Those effects don't
    // re-run on a refresh, so the dashboard would still display the
    // previous user's schedules / sessions / KPIs until something else
    // remounts it. A reload guarantees every page's data refetches with
    // the freshly-set demo-user cookie. Demo account switching is an
    // explicit, infrequent action — the brief reload flash is acceptable.
    window.location.reload();
  }

  // Single seeded user → no switching needed; show name as a label.
  if (users.length <= 1) {
    const u = users[0];
    return u ? (
      <span className="hidden lg:inline text-[12px] text-slate-500 max-w-32 truncate" title={u.full_name}>
        {u.full_name}
      </span>
    ) : null;
  }

  return (
    <select
      className="text-[12px] border border-slate-200 rounded-lg px-2 py-1.5 min-h-[36px] bg-white max-w-[160px] focus-ring"
      value={meId}
      onChange={(e) => pickUser(e.target.value)}
      aria-label="Switch demo account"
      title="Switch demo account within this role"
    >
      {users.map((u) => (
        <option key={u.id} value={u.id}>
          {u.full_name}
        </option>
      ))}
    </select>
  );
}

/**
 * Mobile overflow menu — replaces the inline switchers + sign-out on phones,
 * where they'd otherwise blow past the 375px viewport. Shows the role chip,
 * role select, demo account list, and sign-out in a tap-friendly popover
 * anchored to a ⋯ button at the right edge of the topbar.
 */
function MobileTopbarMenu({
  demo,
  role,
  onSwitchRole,
  onSignOut,
}: {
  demo: boolean;
  role: Role;
  onSwitchRole: (next: Role) => void;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as HTMLElement;
      if (!t.closest?.("[data-topbar-menu]")) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative sm:hidden" data-topbar-menu>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Account menu"
        aria-expanded={open}
        className="w-11 h-11 rounded-lg hover:bg-slate-100 inline-flex items-center justify-center text-slate-700 focus-ring"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <circle cx="5"  cy="12" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="19" cy="12" r="2" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute top-12 right-0 z-30 w-72 max-w-[calc(100vw-1.5rem)]
                     bg-white rounded-2xl shadow-xl border border-slate-200 p-3 space-y-3
                     fade-up"
        >
          <div className="flex items-center justify-between">
            <span
              className="text-[11px] px-2.5 py-1 rounded-full text-white font-bold tracking-wide"
              style={{ background: ROLE_ACCENT[role] }}
            >
              {ROLE_LABEL[role]}
            </span>
            {demo && (
              <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
                Demo
              </span>
            )}
          </div>

          {demo && (
            <>
              <label className="block">
                <span className="text-overline mb-1.5 block">Role</span>
                <select
                  value={role}
                  onChange={(e) => { setOpen(false); onSwitchRole(e.target.value as Role); }}
                  className="w-full text-[14px] border border-slate-200 rounded-lg px-3 py-2.5 min-h-[44px] bg-white focus-ring"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                  ))}
                </select>
              </label>

              <MobileAccountSwitcher role={role} onPick={() => setOpen(false)} />
            </>
          )}

          <button
            onClick={() => { setOpen(false); onSignOut(); }}
            className="w-full btn-secondary"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Mobile-only variant of DemoAccountSwitcher — same data fetch, but renders
 * a full-width 44px-tall select that fits the overflow menu sheet.
 */
function MobileAccountSwitcher({ role, onPick }: { role: Role; onPick: () => void }) {
  const [users, setUsers] = useState<Array<{ id: string; full_name: string }>>([]);
  const [meId, setMeId] = useState<string>("");

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch(`/apis/demo/users?role=${role}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : { users: [] })),
      fetch(`/apis/users/me`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : { user: null })),
    ])
      .then(([usersJson, meJson]) => {
        if (!alive) return;
        setUsers((usersJson?.users ?? []) as Array<{ id: string; full_name: string }>);
        setMeId(meJson?.user?.id ?? "");
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [role]);

  if (users.length <= 1) {
    const u = users[0];
    return u ? (
      <div className="px-1 py-0.5">
        <p className="text-overline">Account</p>
        <p className="text-[13.5px] font-bold text-slate-700 truncate mt-0.5">{u.full_name}</p>
      </div>
    ) : null;
  }

  function pick(id: string) {
    if (id) document.cookie = `fluxtrack_demo_user_id=${id}; path=/; max-age=${60 * 60 * 24 * 365}`;
    else    document.cookie = `fluxtrack_demo_user_id=; path=/; max-age=0`;
    // See DemoAccountSwitcher.pickUser — every page fetches its data in
    // client-side useEffect on mount, so the only way to make those
    // fetches re-run with the new cookie is a full reload. `onPick` (which
    // just closes the overflow menu) is moot since the page is about to
    // be replaced, but we call it for symmetry.
    onPick();
    window.location.reload();
  }

  return (
    <label className="block">
      <span className="text-overline mb-1.5 block">Account</span>
      <select
        value={meId}
        onChange={(e) => pick(e.target.value)}
        className="w-full text-[14px] border border-slate-200 rounded-lg px-3 py-2.5 min-h-[44px] bg-white focus-ring"
        aria-label="Switch demo account"
      >
        {users.map((u) => (
          <option key={u.id} value={u.id}>{u.full_name}</option>
        ))}
      </select>
    </label>
  );
}
