"use client";

import { useCallback, useEffect, useState } from "react";
import RoleTopBar from "@/components/layout/role-topbar";

const NOTIFICATION_EVENTS = [
  { key: "extension_request",  label: "Extension Requests",        desc: "When another faculty requests your room",       defaultPush: true,  defaultEmail: true,  mandatory: false },
  { key: "extension_result",   label: "Extension Results",         desc: "Approval/denial of your extension requests",     defaultPush: true,  defaultEmail: false, mandatory: false },
  { key: "ghost_alerts",       label: "Ghost Booking Alerts",      desc: "When your session is marked as ghosted",         defaultPush: true,  defaultEmail: true,  mandatory: false },
  { key: "late_hold_expiring", label: "Late Hold Expiring",        desc: "Room hold expiration warnings",                  defaultPush: true,  defaultEmail: false, mandatory: false },
  { key: "dispute_updates",    label: "Dispute Updates",           desc: "Status changes on filed disputes",               defaultPush: true,  defaultEmail: true,  mandatory: false },
  { key: "schedule_changes",   label: "Schedule Changes",          desc: "Modifications to your class schedule",           defaultPush: true,  defaultEmail: true,  mandatory: false },
];

type ChannelPref = { push: boolean; email: boolean };
type Prefs = Record<string, ChannelPref>;

const DEFAULT_PREFS: Prefs = Object.fromEntries(
  NOTIFICATION_EVENTS.map((e) => [e.key, { push: e.defaultPush, email: e.defaultEmail }]),
);

export default function PreferencesPage() {
  const [me, setMe] = useState<{ full_name: string; department: string | null } | null>(null);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedToast, setSavedToast] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [meRes, prefRes] = await Promise.all([
        fetch("/api/users/me", { cache: "no-store" }),
        fetch("/api/users/me/preferences", { cache: "no-store" }),
      ]);
      const meJson = await meRes.json();
      const prefJson = await prefRes.json();
      setMe(meJson?.user ?? null);
      const incoming = (prefJson?.preferences ?? {}) as Record<string, ChannelPref>;
      // Merge with defaults so newly added events have sane initial values
      const merged: Prefs = { ...DEFAULT_PREFS };
      for (const [k, v] of Object.entries(incoming)) {
        if (v && typeof v === "object") merged[k] = v;
      }
      setPrefs(merged);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function toggle(key: string, channel: "push" | "email") {
    setPrefs((p) => ({ ...p, [key]: { ...p[key], [channel]: !p[key][channel] } }));
  }

  async function save() {
    setSaving(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/users/me/preferences", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ preferences: prefs }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message ?? data?.error ?? `HTTP ${res.status}`);
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 2500);
    } catch (e) {
      setErrorMsg(String((e as Error).message));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col">
      <RoleTopBar
        greetingName={me?.full_name ?? "Faculty"}
        department={me?.department ?? "—"}
        notificationCount={0}
      />

      <div className="px-4 sm:px-6 lg:px-8 pb-6 lg:pb-8 space-y-4 lg:space-y-5 fade-up">
        {/* Notification preferences */}
        <section className="card-surface p-5 lg:p-6">
          <header className="flex items-center gap-2.5 text-[#001c43] mb-5">
            <span className="w-8 h-8 rounded-xl bg-blue-50 text-[#114b9f] flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 01-3.46 0" />
              </svg>
            </span>
            <h2 className="text-title">Notification Preferences</h2>
          </header>

          {/* Desktop header row (hidden on mobile to save space) */}
          <div className="hidden sm:grid grid-cols-[1fr_70px_70px] gap-3 px-3 mb-2">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Event</p>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center">Push</p>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center">Email</p>
          </div>

          <div className="space-y-1">
            {loading && Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-14 skeleton rounded-xl" />)}
            {!loading && NOTIFICATION_EVENTS.map((e) => {
              const cur = prefs[e.key] ?? { push: false, email: false };
              return (
                <div
                  key={e.key}
                  className="grid grid-cols-1 sm:grid-cols-[1fr_70px_70px] gap-3 px-3 py-3 rounded-xl hover:bg-slate-50 items-center"
                >
                  <div>
                    <p className="text-[13px] font-bold text-[#001c43]">{e.label}</p>
                    <p className="text-[11px] text-slate-500 leading-tight">{e.desc}</p>
                  </div>
                  <div className="flex sm:hidden gap-3">
                    <span className="flex items-center gap-2 text-[11px] text-slate-500">
                      <Toggle on={cur.push} onClick={() => toggle(e.key, "push")} />
                      Push
                    </span>
                    <span className="flex items-center gap-2 text-[11px] text-slate-500">
                      <Toggle on={cur.email} onClick={() => toggle(e.key, "email")} disabled={e.mandatory} />
                      Email
                    </span>
                  </div>
                  <div className="hidden sm:flex justify-center">
                    <Toggle on={cur.push} onClick={() => toggle(e.key, "push")} />
                  </div>
                  <div className="hidden sm:flex justify-center">
                    <Toggle on={cur.email} onClick={() => toggle(e.key, "email")} disabled={e.mandatory} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {errorMsg && (
          <p className="px-4 py-3 rounded-xl bg-rose-50 border border-rose-200 text-[12.5px] text-rose-700 font-medium">
            {errorMsg}
          </p>
        )}

        <div className="flex items-center justify-end gap-3">
          <button
            onClick={save}
            disabled={saving || loading}
            className="btn-primary px-6 py-3 rounded-lg text-[13px] disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Preferences"}
          </button>
        </div>

        {savedToast && (
          <div className="fixed bottom-6 right-6 z-50 bg-[#001c43] text-white px-5 py-3 rounded-xl shadow-2xl text-sm font-bold flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Preferences saved
          </div>
        )}
      </div>
    </div>
  );
}

function Toggle({ on, onClick, disabled }: { on: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`relative w-11 h-6 rounded-full transition-colors ${
        on ? "bg-emerald-500" : "bg-slate-200"
      } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
      aria-pressed={on}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
          on ? "translate-x-5" : ""
        }`}
      />
    </button>
  );
}
