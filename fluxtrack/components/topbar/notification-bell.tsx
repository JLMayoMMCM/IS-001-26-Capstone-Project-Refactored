"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useNotifications } from "@/hooks/use-notifications";

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function NotificationBell() {
  const { items, unread, markRead } = useNotifications({ realtime: true });
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const recent = items.slice(0, 8);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative w-9 h-9 rounded-md hover:bg-slate-100 inline-flex items-center justify-center text-slate-600"
        aria-label="Notifications"
        aria-expanded={open}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-rose-600 text-white text-[10px] font-semibold inline-flex items-center justify-center"
            aria-label={`${unread} unread notifications`}
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-80 max-w-[calc(100vw-1rem)] rounded-lg border border-slate-200 bg-white shadow-lg z-30">
          <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-900">Notifications</span>
            <span className="text-[10px] text-slate-500">{unread} unread</span>
          </div>
          {recent.length === 0 ? (
            <div className="p-4 text-xs text-slate-500 text-center">No notifications yet.</div>
          ) : (
            <ul className="max-h-96 overflow-y-auto divide-y divide-slate-100">
              {recent.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => {
                      if (!n.read_at) markRead(n.id);
                    }}
                    className={`w-full text-left px-3 py-2 hover:bg-slate-50 ${!n.read_at ? "bg-blue-50/40" : ""}`}
                  >
                    <div className="flex items-start gap-2">
                      {!n.read_at && (
                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-slate-900 truncate">{n.title}</div>
                        <div className="text-[11px] text-slate-600 line-clamp-2">{n.body}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{timeAgo(n.created_at)}</div>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="px-3 py-2 border-t border-slate-100 text-right">
            <Link href="/guard/guard-notifications" className="text-xs text-slate-600 hover:underline">
              See all →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
