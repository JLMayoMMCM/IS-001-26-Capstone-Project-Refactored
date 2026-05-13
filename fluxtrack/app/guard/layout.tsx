"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import RoleSwitcher from "@/components/demo/role-switcher";

export default function GuardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const tabs = [
    {
      label: "Room Status",
      href: "/guard-dashboard",
      badge: 0,
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      ),
    },
    {
      label: "Notifications",
      href: "/guard-notifications",
      badge: 2,
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
      ),
    },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      {/* Top app bar */}
      <header className="fixed top-0 left-0 right-0 z-20 bg-white border-b border-slate-200 h-14 flex items-center px-4">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: "var(--brand-navy)" }}>
            <span className="text-white text-xs font-bold">FT</span>
          </div>
          <span className="font-bold text-slate-800 text-sm truncate">Guard Dashboard</span>
        </div>
        <div className="flex items-center justify-center px-2">
          <span className="text-xs px-3 py-1 rounded-full bg-slate-100 text-slate-700 font-semibold whitespace-nowrap">
            Floor 2
          </span>
        </div>
        <div className="flex items-center gap-2 flex-1 justify-end">
          <RoleSwitcher />
          <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-white text-xs font-bold shrink-0">
            JC
          </div>
        </div>
      </header>

      {/* Content area */}
      <main className="flex-1 overflow-auto" style={{ paddingTop: "56px", paddingBottom: "64px" }}>
        {children}
      </main>

      {/* Bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-20 bg-white border-t border-slate-200">
        <div className="flex">
          {tabs.map((tab) => {
            const isActive =
              tab.href === "/guard-dashboard"
                ? pathname === tab.href
                : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 px-2 transition-colors relative ${
                  isActive ? "text-blue-600" : "text-slate-400 hover:text-slate-600"
                }`}
              >
                <div className="relative">
                  {tab.icon}
                  {tab.badge > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold leading-none">
                      {tab.badge}
                    </span>
                  )}
                </div>
                <span className="text-xs font-medium">{tab.label}</span>
                {isActive && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-blue-600 rounded-b-full" />
                )}
              </Link>
            );
          })}
        </div>
        <div style={{ height: "env(safe-area-inset-bottom, 0px)" }} />
      </nav>
    </div>
  );
}
