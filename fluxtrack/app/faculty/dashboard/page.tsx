"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import RoleTopBar from "@/components/layout/role-topbar";
import { useActiveSession } from "@/hooks/use-active-session";

type Modality = "f2f" | "blended" | "online";

type Schedule = {
  id: string;
  course_code: string;
  course_name: string;
  section: string | null;
  enrolled_count: number;
  scheduled_modality: Modality;
  start_time: string; // "HH:MM:SS"
  end_time: string;
  faculty_id: string;
  room: { id: string; room_code: string; building: string; floor_number: number } | null;
};

type Session = {
  id: string;
  schedule_id: string;
  faculty_id: string;
  room_id: string;
  status:
    | "scheduled"
    | "pending"
    | "active"
    | "en_route"
    | "completed"
    | "early_end"
    | "absent"
    | "overstay"
    | "checker_flagged";
  actual_start: string | null;
  actual_end: string | null;
  duration_minutes: number | null;
  actual_modality: Modality | null;
};

type Me = { id: string; full_name: string; faculty_id: string | null; department: string | null };

type ActivityItem = {
  id: string;
  session_date: string;
  status: Session["status"];
  actual_start: string | null;
  actual_end: string | null;
  duration_minutes: number | null;
  schedule: { course_code: string; course_name: string } | null;
  room: { room_code: string } | null;
};

const MODALITY_LABELS: Record<Modality, string> = { f2f: "F2F", blended: "Hybrid", online: "Online" };

function ModalityBadge({ m }: { m: Modality }) {
  const c =
    m === "f2f" ? "badge-f2f" : m === "blended" ? "badge-hybrid" : "badge-online";
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${c}`}>
      {MODALITY_LABELS[m]}
    </span>
  );
}

export default function FacultyDashboard() {
  const [me, setMe] = useState<Me | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<null | "checkin" | "extension" | "end" | "enroute" | "assist">(null);
  const [actionTarget, setActionTarget] = useState<{ scheduleId: string; sessionId: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Modal state
  const [modality, setModality] = useState<Modality>("f2f");
  const [photoCaptured, setPhotoCaptured] = useState(false);
  const [teamsLink, setTeamsLink] = useState("");
  const [extensionMinutes, setExtensionMinutes] = useState<15 | 30>(15);
  const [extensionReason, setExtensionReason] = useState("");
  const [etaMinutes, setEtaMinutes] = useState(15);
  const [enRouteReason, setEnRouteReason] = useState<"current_class" | "traffic" | "commute" | "other">("traffic");
  const [assistTypes, setAssistTypes] = useState<string[]>([]);
  const [assistNote, setAssistNote] = useState("");
  const [assistTarget, setAssistTarget] = useState<"ifo" | "hr" | "guard">("ifo");
  // Manual pin: if set, overrides the auto-derived `currentItem` so faculty
  // can preview the check-in flow for any class on their schedule. `null`
  // means "follow auto" (active session → first scheduled → first item).
  const [pinnedScheduleId, setPinnedScheduleId] = useState<string | null>(null);
  // When a class goes live while a different schedule is pinned, surface a
  // small banner offering to switch. Tracked separately so dismissing the
  // banner doesn't clear the user's pin.
  const [liveBannerSession, setLiveBannerSession] = useState<{ id: string; courseCode: string } | null>(null);

  const { session: liveSession } = useActiveSession(me?.id ?? null);

  // Initial load: me, schedules today, sessions today, recent activity (any date)
  const refreshData = useCallback(async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const [meRes, schedRes, sessRes, activityRes] = await Promise.all([
        fetch("/api/users/me", { cache: "no-store" }),
        fetch("/api/schedules?day=today", { cache: "no-store" }),
        fetch(`/api/sessions?date=${today}`, { cache: "no-store" }),
        // Recent activity: most-recent sessions across all dates (RLS scopes
        // to faculty's own). The API already orders by session_date desc + actual_start desc.
        fetch("/api/sessions", { cache: "no-store" }),
      ]);
      const meData = await meRes.json();
      const schedData = await schedRes.json();
      const sessData = await sessRes.json();
      const activityData = await activityRes.json();
      setMe(meData?.user ?? null);
      setSchedules(schedData?.schedules ?? []);
      setSessions(sessData?.sessions ?? []);
      setActivity(activityData?.sessions ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // When the live session updates via realtime, refresh sessions list to keep
  // the schedule cards in sync.
  useEffect(() => {
    if (liveSession) {
      setSessions((prev) => {
        const exists = prev.find((s) => s.id === liveSession.id);
        if (exists) {
          return prev.map((s) =>
            s.id === liveSession.id ? { ...s, status: liveSession.status as Session["status"], actual_start: liveSession.actual_start, actual_end: liveSession.actual_end } : s,
          );
        }
        return prev;
      });
    }
  }, [liveSession]);

  // Derive: pair schedule with its session today
  const items = useMemo(() => {
    return schedules.map((sch) => {
      const sess = sessions.find((s) => s.schedule_id === sch.id);
      return { schedule: sch, session: sess };
    });
  }, [schedules, sessions]);

  // The auto-derived "current class" — active session if any; else first scheduled.
  // Kept separate from `currentItem` so the banner-on-new-live logic can
  // compare what the auto pick would have been against what's currently shown.
  const autoCurrentItem = useMemo(() => {
    const active = items.find((i) => i.session?.status === "active" || i.session?.status === "en_route");
    if (active) return active;
    const scheduled = items.find((i) => i.session?.status === "scheduled" || !i.session);
    return scheduled ?? items[0];
  }, [items]);

  const pinnedItem = useMemo(
    () => (pinnedScheduleId ? items.find((i) => i.schedule.id === pinnedScheduleId) : undefined),
    [pinnedScheduleId, items],
  );

  // Auto-clear pin if the schedule it points to is no longer in the list
  // (e.g. data refetch removed it).
  useEffect(() => {
    if (pinnedScheduleId && !pinnedItem && items.length > 0) {
      setPinnedScheduleId(null);
    }
  }, [pinnedScheduleId, pinnedItem, items]);

  const currentItem = pinnedItem ?? autoCurrentItem;
  const isActive = currentItem?.session?.status === "active";

  // Surface a "X just went live" banner when a class becomes active while
  // the user has a different schedule pinned.
  useEffect(() => {
    if (!pinnedScheduleId) {
      setLiveBannerSession(null);
      return;
    }
    const newlyActive = items.find(
      (i) => i.session?.status === "active" && i.schedule.id !== pinnedScheduleId,
    );
    if (newlyActive) {
      setLiveBannerSession({
        id: newlyActive.schedule.id,
        courseCode: newlyActive.schedule.course_code,
      });
    } else {
      setLiveBannerSession(null);
    }
  }, [items, pinnedScheduleId]);

  // ─── Action helpers ────────────────────────────────────────────────────────
  const openCheckin = (sessionId: string, scheduleId: string, mod: Modality) => {
    setActionTarget({ sessionId, scheduleId });
    setModality(mod);
    setPhotoCaptured(false);
    setTeamsLink("");
    setErrorMsg(null);
    setModal("checkin");
  };
  const openEnd = (sessionId: string, scheduleId: string) => {
    setActionTarget({ sessionId, scheduleId });
    setErrorMsg(null);
    setModal("end");
  };
  const openExtension = (sessionId: string, scheduleId: string) => {
    setActionTarget({ sessionId, scheduleId });
    setExtensionMinutes(15);
    setExtensionReason("");
    setErrorMsg(null);
    setModal("extension");
  };
  const openEnRoute = (sessionId: string, scheduleId: string, mod: Modality) => {
    setActionTarget({ sessionId, scheduleId });
    setModality(mod);
    setEtaMinutes(15);
    setEnRouteReason("traffic");
    setErrorMsg(null);
    setModal("enroute");
  };
  const openAssist = (target: "ifo" | "hr" | "guard") => {
    setAssistTarget(target);
    setAssistTypes([]);
    setAssistNote("");
    setErrorMsg(null);
    setModal("assist");
  };
  const closeModal = () => {
    setModal(null);
    setBusy(false);
    setErrorMsg(null);
  };

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  }

  async function api<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(path, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.error?.message ?? data?.error ?? `HTTP ${res.status}`);
    }
    return data as T;
  }

  // ─── Submit handlers ───────────────────────────────────────────────────────
  async function handleStart() {
    if (!actionTarget) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      await api(`/api/sessions/${actionTarget.sessionId}/start`, {
        method: "POST",
        body: JSON.stringify({
          modality,
          // demo: photo upload not wired; we send a stable placeholder path for f2f/blended
          photo_storage_path: photoCaptured ? `demo/${actionTarget.sessionId}.jpg` : undefined,
          teams_link: teamsLink || undefined,
          self_declared_on_campus: true,
          wlan_on_campus: true,
        }),
      });
      await refreshData();
      closeModal();
      showToast("Session started.");
    } catch (e) {
      setErrorMsg(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function handleEnd() {
    if (!actionTarget) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      await api(`/api/sessions/${actionTarget.sessionId}/end`, { method: "POST" });
      await refreshData();
      closeModal();
      showToast("Session ended.");
    } catch (e) {
      setErrorMsg(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function handleExtension() {
    if (!actionTarget) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      await api(`/api/sessions/${actionTarget.sessionId}/extension`, {
        method: "POST",
        body: JSON.stringify({ requested_minutes: extensionMinutes }),
      });
      await refreshData();
      closeModal();
      showToast(`Extension requested (+${extensionMinutes}m).`);
    } catch (e) {
      setErrorMsg(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function handleEnRoute() {
    if (!actionTarget) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      await api(`/api/sessions/${actionTarget.sessionId}/en-route`, {
        method: "POST",
        body: JSON.stringify({ eta_minutes: etaMinutes, reason: enRouteReason }),
      });
      await refreshData();
      closeModal();
      showToast(`En route declared (ETA ${etaMinutes}m).`);
    } catch (e) {
      setErrorMsg(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function handleAssist() {
    setBusy(true);
    setErrorMsg(null);
    try {
      const room_id = currentItem?.schedule.room?.id;
      if (!room_id) throw new Error("No room context for assist.");
      const types = assistTypes.length > 0 ? assistTypes : ["facility"];
      await api("/api/assists", {
        method: "POST",
        body: JSON.stringify({
          room_id,
          session_id: currentItem?.session?.id ?? undefined,
          assist_types: types,
          note: `[${assistTarget.toUpperCase()}] ${assistNote || "Quick assist requested"}`,
        }),
      });
      closeModal();
      showToast(`Assist sent to ${assistTarget.toUpperCase()}.`);
    } catch (e) {
      setErrorMsg(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  function fmtTime(t: string) {
    // "08:00:00" → "8:00 AM"
    const [h, m] = t.split(":").map(Number);
    const am = h < 12;
    const hh = ((h + 11) % 12) + 1;
    return `${hh}:${m.toString().padStart(2, "0")} ${am ? "AM" : "PM"}`;
  }

  return (
    <div className="flex-1 flex flex-col fade-up min-h-0">
      <RoleTopBar
        greetingName={me?.full_name ?? "Faculty"}
        department={me?.department ?? "—"}
      />

      <div className="px-4 sm:px-6 lg:px-8 pb-6 lg:pb-8 grid grid-cols-12 gap-4 lg:gap-5 flex-1 lg:min-h-0">
        {/* ── LEFT COLUMN ── */}
        <div className="col-span-12 lg:col-span-4 xl:col-span-3 flex flex-col gap-4 lg:gap-5 lg:min-h-0">
          <section className="card-surface overflow-hidden lg:flex-1 lg:flex lg:flex-col lg:min-h-0">
            <header className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2 text-[#001c43]">
                <span className="w-7 h-7 rounded-lg bg-blue-50 text-[#114b9f] flex items-center justify-center">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                  </svg>
                </span>
                <span className="text-title">Today&apos;s Schedule</span>
              </div>
              <span className="text-[11px] px-2.5 py-1 rounded-full bg-blue-50 text-[#114b9f] font-bold">
                {items.length} {items.length === 1 ? "class" : "classes"}
              </span>
            </header>

            <div className="p-3 flex flex-col gap-2 max-h-[420px] lg:max-h-none lg:flex-1 lg:min-h-0 overflow-y-auto">
              {loading && Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 skeleton rounded-lg" />)}
              {!loading && items.length === 0 && (
                <p className="text-center text-[12px] text-slate-400 py-6">No classes scheduled today.</p>
              )}
              {items.map(({ schedule, session }) => {
                const isCurrent = schedule.id === currentItem?.schedule.id;
                const isPinned = schedule.id === pinnedScheduleId;
                const isLiveAuto = isCurrent && !isPinned && (session?.status === "active" || session?.status === "en_route");
                return (
                  <button
                    type="button"
                    key={schedule.id}
                    onClick={() =>
                      setPinnedScheduleId((cur) => (cur === schedule.id ? null : schedule.id))
                    }
                    aria-pressed={isPinned}
                    aria-label={`Show ${schedule.course_code} in the check-in panel`}
                    className={`text-left rounded-lg border p-3.5 transition-all duration-200 cursor-pointer focus:outline-none focus-ring ${
                      isLiveAuto
                        ? "border-transparent shadow-md"
                        : isPinned
                        ? "border-blue-300 bg-blue-50/40 ring-2 ring-blue-200 shadow-sm"
                        : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"
                    }`}
                    style={isLiveAuto ? { background: "linear-gradient(135deg, #001c43 0%, #0a2a5a 60%, #114b9f 100%)" } : undefined}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <p className={`text-[11px] font-medium ${isLiveAuto ? "text-blue-200" : "text-slate-500"}`}>
                        {fmtTime(schedule.start_time)} – {fmtTime(schedule.end_time)}
                      </p>
                      <span className="inline-flex items-center gap-1.5">
                        {isPinned && !isLiveAuto && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-600 text-white font-bold uppercase tracking-wider">Pinned</span>
                        )}
                        <ModalityBadge m={schedule.scheduled_modality} />
                      </span>
                    </div>
                    <p className={`text-[13.5px] font-bold leading-tight ${isLiveAuto ? "text-white" : "text-[#001c43]"}`}>
                      {schedule.course_code}: {schedule.course_name}
                    </p>
                    <div className={`mt-2 flex items-center gap-2.5 text-[11px] ${isLiveAuto ? "text-blue-200" : "text-slate-500"}`}>
                      <span>Room {schedule.room?.room_code ?? "—"}</span>
                      <span>·</span>
                      <span>{schedule.section}</span>
                      <span>·</span>
                      <span>{schedule.enrolled_count}</span>
                      {session && (
                        <span className="ml-auto font-bold uppercase text-[9.5px] tracking-wider">{session.status}</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="card-surface p-5">
            <div className="flex items-center gap-3">
              <span className="w-12 h-12 rounded-lg text-white text-sm font-bold flex items-center justify-center shadow-md" style={{ background: "linear-gradient(135deg,#114b9f 0%,#1e3a8a 100%)" }}>
                {(me?.full_name ?? "?").split(" ").map((s) => s[0]).filter(Boolean).slice(0, 2).join("")}
              </span>
              <div className="min-w-0">
                <p className="text-[13.5px] font-bold text-[#001c43] truncate tracking-tight">{me?.full_name ?? "—"}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Faculty ID: {me?.faculty_id ?? "—"}</p>
              </div>
            </div>
          </section>
        </div>

        {/* ── CENTER COLUMN ── */}
        <div className="col-span-12 lg:col-span-5 xl:col-span-6 flex flex-col gap-4 lg:gap-5">
          {/* Pin indicator — visible only when manually selecting a non-current schedule */}
          {pinnedItem && (
            <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg bg-blue-50 border border-blue-200 text-[12px] text-blue-900">
              <span className="inline-flex items-center gap-2 min-w-0">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" className="shrink-0">
                  <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
                </svg>
                <span className="truncate">
                  Showing <span className="font-bold">{pinnedItem.schedule.course_code}</span>
                </span>
              </span>
              <button
                type="button"
                onClick={() => setPinnedScheduleId(null)}
                className="text-[11px] font-bold text-[#114b9f] hover:underline shrink-0"
              >
                Clear pin →
              </button>
            </div>
          )}

          {/* "Class went live" banner — surfaces when a schedule activates while a different one is pinned */}
          {liveBannerSession && pinnedItem && (
            <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-[12px] text-emerald-900">
              <span className="inline-flex items-center gap-2 min-w-0">
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-70 animate-ping" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                <span className="truncate">
                  <span className="font-bold">{liveBannerSession.courseCode}</span> just went live
                </span>
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setPinnedScheduleId(null);
                    setLiveBannerSession(null);
                  }}
                  className="text-[11px] font-bold px-2.5 py-1 rounded-md bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  Switch
                </button>
                <button
                  type="button"
                  onClick={() => setLiveBannerSession(null)}
                  className="text-[11px] font-medium text-emerald-700 hover:text-emerald-900"
                  aria-label="Dismiss"
                >
                  ✕
                </button>
              </div>
            </div>
          )}

          {currentItem ? <CheckinCard item={currentItem} fmtTime={fmtTime}
              onStart={(mod) => currentItem.session && openCheckin(currentItem.session.id, currentItem.schedule.id, mod)}
              onEnd={() => currentItem.session && openEnd(currentItem.session.id, currentItem.schedule.id)}
              onExtend={() => currentItem.session && openExtension(currentItem.session.id, currentItem.schedule.id)}
              onEnRoute={(mod) => currentItem.session && openEnRoute(currentItem.session.id, currentItem.schedule.id, mod)}
            /> : loading ? <div className="card-surface p-12 skeleton h-72" /> : (
              <div className="card-surface p-12 text-center text-slate-400 text-sm">No upcoming class today.</div>
            )}
        </div>

        {/* ── RIGHT COLUMN ── */}
        <div className="col-span-12 lg:col-span-3 flex flex-col gap-4 lg:gap-5 lg:min-h-0">
          <section className="rounded-lg shadow-md overflow-hidden bg-white border border-slate-200">
            <header className="px-5 pt-5 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-xl bg-rose-50 flex items-center justify-center">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#e50019" strokeWidth="2">
                    <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 01-3.46 0" />
                  </svg>
                </span>
                <span className="text-title text-[#e50019]">Quick Assistance</span>
              </div>
              <p className="text-[11.5px] mt-0.5 text-slate-500">Immediate support for faculty</p>
            </header>
            <div className="px-5 pb-5 space-y-2">
              {[
                { label: "Contact IFO", target: "ifo" as const },
                { label: "Contact HR", target: "hr" as const },
                { label: "Contact Guard", target: "guard" as const },
              ].map((b) => (
                <button
                  key={b.label}
                  onClick={() => openAssist(b.target)}
                  className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl text-[13px] font-bold transition-all duration-200 bg-white text-[#e50019] border border-rose-200 hover:bg-rose-50 hover:border-rose-300"
                >
                  {b.label}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              ))}
            </div>
          </section>

          {/* Recent Activity — last 5 sessions (any date), driven by /api/sessions */}
          <section className="card-surface overflow-hidden lg:flex-1 lg:flex lg:flex-col lg:min-h-0">
            <header className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2 text-[#001c43]">
                <span className="w-7 h-7 rounded-lg bg-blue-50 text-[#114b9f] flex items-center justify-center">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </span>
                <span className="text-title">Recent Activity</span>
              </div>
              <Link
                href="/attendance"
                className="text-[11px] font-bold text-[#114b9f] hover:underline"
              >
                View All →
              </Link>
            </header>
            <ul className="divide-y divide-slate-100 lg:flex-1 lg:overflow-y-auto">
              {loading && activity.length === 0 && Array.from({ length: 4 }).map((_, i) => (
                <li key={i} className="px-5 py-3"><div className="h-10 skeleton rounded-md" /></li>
              ))}
              {!loading && activity.length === 0 && (
                <li className="px-5 py-8 text-center text-[12px] text-slate-400">No recent sessions.</li>
              )}
              {activity.slice(0, 5).map((a) => (
                <li key={a.id}>
                  <Link
                    href={`/attendance?session=${a.id}`}
                    className="flex items-start gap-2.5 px-5 py-3 hover:bg-slate-50 transition-colors"
                  >
                    <ActivityStatusIcon status={a.status} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[12.5px] font-bold text-[#001c43] truncate">
                        {a.schedule?.course_code ?? "—"}{" "}
                        <span className="font-medium text-slate-500 capitalize">
                          · {a.status.replace("_", " ")}
                        </span>
                      </p>
                      <p className="text-[10.5px] text-slate-400 mt-0.5">
                        {fmtRelativeDate(a.session_date)}
                        {a.duration_minutes != null && ` · ${a.duration_minutes}m`}
                        {a.room?.room_code && ` · Room ${a.room.room_code}`}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      {/* ─── Modals ────────────────────────────────────────────────────────── */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 sm:p-6" onClick={closeModal}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md px-7 py-7 sm:px-8 sm:py-8" onClick={(e) => e.stopPropagation()}>
            {modal === "checkin" && (
              <>
                <h2 className="text-title text-[#001c43] mb-1">Start Class</h2>
                <p className="text-[12px] text-slate-500 mb-5">{currentItem?.schedule.course_code} · Room {currentItem?.schedule.room?.room_code}</p>
                <div className="flex gap-2 mb-4">
                  {(["f2f", "blended", "online"] as Modality[]).map((m) => (
                    <button
                      key={m}
                      onClick={() => setModality(m)}
                      className={`flex-1 py-2 rounded-xl text-[12px] font-bold ${modality === m ? "bg-[#001c43] text-white" : "bg-slate-100 text-slate-600"}`}
                    >
                      {MODALITY_LABELS[m]}
                    </button>
                  ))}
                </div>
                {(modality === "f2f" || modality === "blended") && (
                  <button
                    onClick={() => setPhotoCaptured((v) => !v)}
                    className={`w-full mb-3 py-3 rounded-xl text-[12.5px] font-bold border-2 ${photoCaptured ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-dashed border-slate-300 text-slate-500"}`}
                  >
                    {photoCaptured ? "✓ Classroom photo captured (demo)" : "Tap to capture classroom photo"}
                  </button>
                )}
                {(modality === "blended" || modality === "online") && (
                  <input
                    type="url"
                    value={teamsLink}
                    onChange={(e) => setTeamsLink(e.target.value)}
                    placeholder="https://teams.microsoft.com/…"
                    className="w-full mb-3 px-3.5 py-3 rounded-xl border border-slate-200 text-[13px] focus:outline-none focus:border-[#114b9f]"
                  />
                )}
                {errorMsg && <p className="mb-3 text-[12px] text-rose-600 bg-rose-50 px-3 py-2 rounded-lg">{errorMsg}</p>}
                <div className="flex gap-2">
                  <button onClick={closeModal} className="flex-1 py-3 rounded-xl text-[13px] font-bold border border-slate-200 text-slate-600">Cancel</button>
                  <button onClick={handleStart} disabled={busy} className="btn-primary flex-1 py-3 rounded-xl text-[13px]">{busy ? "Starting…" : `Start ${MODALITY_LABELS[modality]}`}</button>
                </div>
              </>
            )}

            {modal === "end" && (
              <>
                <h2 className="text-title text-[#001c43] mb-1">End session?</h2>
                <p className="text-[12.5px] text-slate-500 mb-5">This marks the session as completed (or early end if under 40 minutes).</p>
                {errorMsg && <p className="mb-3 text-[12px] text-rose-600 bg-rose-50 px-3 py-2 rounded-lg">{errorMsg}</p>}
                <div className="flex gap-2">
                  <button onClick={closeModal} className="flex-1 py-3 rounded-xl text-[13px] font-bold border border-slate-200 text-slate-600">Cancel</button>
                  <button onClick={handleEnd} disabled={busy} className="flex-1 py-3 rounded-xl text-[13px] font-bold text-white bg-rose-500 hover:bg-rose-600 disabled:opacity-50">{busy ? "Ending…" : "End session"}</button>
                </div>
              </>
            )}

            {modal === "extension" && (
              <>
                <h2 className="text-title text-[#001c43] mb-1">Request extension</h2>
                <p className="text-[12.5px] text-slate-500 mb-5">If a faculty is scheduled next, they must approve. Otherwise auto-approved.</p>
                <div className="flex gap-2 mb-4">
                  {[15, 30].map((m) => (
                    <button
                      key={m}
                      onClick={() => setExtensionMinutes(m as 15 | 30)}
                      className={`flex-1 py-3 rounded-xl text-[13px] font-bold border ${extensionMinutes === m ? "border-[#114b9f] bg-blue-50 text-[#114b9f]" : "border-slate-200 text-slate-600"}`}
                    >
                      +{m} min
                    </button>
                  ))}
                </div>
                <textarea
                  value={extensionReason}
                  onChange={(e) => setExtensionReason(e.target.value)}
                  rows={2}
                  placeholder="Reason (optional)"
                  className="w-full px-3.5 py-3 rounded-xl border border-slate-200 text-[13px] mb-3"
                />
                {errorMsg && <p className="mb-3 text-[12px] text-rose-600 bg-rose-50 px-3 py-2 rounded-lg">{errorMsg}</p>}
                <div className="flex gap-2">
                  <button onClick={closeModal} className="flex-1 py-3 rounded-xl text-[13px] font-bold border border-slate-200 text-slate-600">Cancel</button>
                  <button onClick={handleExtension} disabled={busy} className="btn-primary flex-1 py-3 rounded-xl text-[13px]">{busy ? "Requesting…" : `Request +${extensionMinutes}m`}</button>
                </div>
              </>
            )}

            {modal === "enroute" && (
              <>
                <h2 className="text-title text-[#001c43] mb-1">Declare late / en route</h2>
                <p className="text-[12.5px] text-slate-500 mb-5">Hold the room until you arrive.</p>
                <p className="text-overline mb-2">ETA</p>
                <div className="flex gap-2 mb-4">
                  {[10, 15, 20, 30].map((m) => (
                    <button key={m} onClick={() => setEtaMinutes(m)} className={`flex-1 py-2.5 rounded-xl text-[12px] font-bold border ${etaMinutes === m ? "border-orange-400 bg-orange-50 text-orange-700" : "border-slate-200 text-slate-500"}`}>
                      {m}m
                    </button>
                  ))}
                </div>
                <p className="text-overline mb-2">Reason</p>
                <select value={enRouteReason} onChange={(e) => setEnRouteReason(e.target.value as typeof enRouteReason)} className="w-full px-3.5 py-3 rounded-xl border border-slate-200 text-[13px] mb-3">
                  <option value="traffic">Stuck in traffic</option>
                  <option value="current_class">Still in current class</option>
                  <option value="commute">Commute delay</option>
                  <option value="other">Other</option>
                </select>
                {errorMsg && <p className="mb-3 text-[12px] text-rose-600 bg-rose-50 px-3 py-2 rounded-lg">{errorMsg}</p>}
                <div className="flex gap-2">
                  <button onClick={closeModal} className="flex-1 py-3 rounded-xl text-[13px] font-bold border border-slate-200 text-slate-600">Cancel</button>
                  <button onClick={handleEnRoute} disabled={busy} className="flex-1 py-3 rounded-xl text-[13px] font-bold text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-50">{busy ? "Declaring…" : `Declare (${etaMinutes}m ETA)`}</button>
                </div>
              </>
            )}

            {modal === "assist" && (
              <>
                <h2 className="text-title text-[#001c43] mb-1">Send Quick Assist</h2>
                <p className="text-[12.5px] text-slate-500 mb-5">Sending to <span className="font-bold uppercase">{assistTarget}</span> from Room {currentItem?.schedule.room?.room_code ?? "—"}.</p>
                <p className="text-overline mb-2">Type</p>
                <div className="flex flex-wrap gap-2 mb-4">
                  {["facility", "medical", "it_support", "security"].map((t) => {
                    const on = assistTypes.includes(t);
                    return (
                      <button
                        key={t}
                        onClick={() => setAssistTypes((p) => (on ? p.filter((x) => x !== t) : [...p, t]))}
                        className={`px-3 py-1.5 rounded-full text-[11.5px] font-bold border ${on ? "border-[#114b9f] bg-blue-50 text-[#114b9f]" : "border-slate-200 text-slate-600"}`}
                      >
                        {t.replace("_", " ")}
                      </button>
                    );
                  })}
                </div>
                <textarea
                  value={assistNote}
                  onChange={(e) => setAssistNote(e.target.value)}
                  rows={2}
                  placeholder="Note (optional)"
                  className="w-full px-3.5 py-3 rounded-xl border border-slate-200 text-[13px] mb-3"
                />
                {errorMsg && <p className="mb-3 text-[12px] text-rose-600 bg-rose-50 px-3 py-2 rounded-lg">{errorMsg}</p>}
                <div className="flex gap-2">
                  <button onClick={closeModal} className="flex-1 py-3 rounded-xl text-[13px] font-bold border border-slate-200 text-slate-600">Cancel</button>
                  <button onClick={handleAssist} disabled={busy} className="flex-1 py-3 rounded-xl text-[13px] font-bold text-white bg-[#e50019] hover:opacity-90 disabled:opacity-50">{busy ? "Sending…" : "Send assist"}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[60] bg-[#001c43] text-white px-5 py-3 rounded-xl shadow-2xl text-[13px] font-bold flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
          {toast}
        </div>
      )}
      {/* Suppress unused-state warning for isActive (kept for future visual cue) */}
      <span className="hidden">{isActive ? "live" : ""}</span>
    </div>
  );
}

// ─── Sub-component: Check-in card (center column) ─────────────────────────────
function CheckinCard({
  item,
  fmtTime,
  onStart,
  onEnd,
  onExtend,
  onEnRoute,
}: {
  item: { schedule: Schedule; session?: Session };
  fmtTime: (t: string) => string;
  onStart: (m: Modality) => void;
  onEnd: () => void;
  onExtend: () => void;
  onEnRoute: (m: Modality) => void;
}) {
  const session = item.session;
  const isActive = session?.status === "active";
  const isEnRoute = session?.status === "en_route";
  const isFinal = session && ["completed", "early_end", "absent", "overstay"].includes(session.status);
  const [pickedModality, setPickedModality] = useState<Modality>(item.schedule.scheduled_modality);

  return (
    <section className="card-surface overflow-hidden">
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
        <span className="text-overline">Check-in</span>
        <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold uppercase tracking-wider ${
          isActive ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
          isEnRoute ? "bg-orange-50 text-orange-700 border border-orange-200" :
          isFinal ? "bg-slate-100 text-slate-500 border border-slate-200" :
          "bg-slate-50 text-slate-600 border border-slate-200"
        }`}>
          {isActive ? "● In Session" : isEnRoute ? "En Route" : isFinal ? session?.status : "Upcoming"}
        </span>
      </header>

      <div className="p-6">
        <h2 className="text-title text-[#001c43] leading-tight">
          {item.schedule.course_code}: {item.schedule.course_name}
        </h2>
        <div className="mt-2 flex items-center gap-3 text-[11.5px] text-slate-500 flex-wrap">
          <span>Room {item.schedule.room?.room_code ?? "—"}</span>
          <span>· {item.schedule.section}</span>
          <span>· {item.schedule.enrolled_count} students</span>
          <span className="ml-auto font-bold text-[#001c43]">{fmtTime(item.schedule.start_time)} – {fmtTime(item.schedule.end_time)}</span>
        </div>

        <div className="my-5 h-px bg-slate-100" />

        {!isActive && !isEnRoute && !isFinal && (
          <>
            <p className="text-overline mb-2.5">Class Modality</p>
            <div className="flex gap-2 mb-5 p-1 bg-slate-50 rounded-lg">
              {(["f2f", "blended", "online"] as Modality[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setPickedModality(m)}
                  className={`flex-1 py-2.5 rounded-xl text-[12.5px] font-bold transition-all duration-200 ${
                    pickedModality === m ? "bg-white text-[#001c43] shadow-sm" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {MODALITY_LABELS[m]}
                </button>
              ))}
            </div>
            <div className="space-y-2.5">
              <button onClick={() => onStart(pickedModality)} className="btn-primary w-full inline-flex items-center justify-center gap-2 py-3.5 rounded-lg text-sm">
                Start {MODALITY_LABELS[pickedModality]} Class
              </button>
              <button onClick={() => onEnRoute(pickedModality)} className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-bold text-orange-600 border-2 border-orange-200 bg-orange-50/50 hover:bg-orange-50 hover:border-orange-300 transition-all">
                Declare Late / En Route
              </button>
            </div>
          </>
        )}

        {isActive && (
          <div className="space-y-2.5">
            <div className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-bold text-white shadow-md" style={{ background: "linear-gradient(135deg,#10b981 0%,#059669 100%)" }}>
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-white opacity-70 animate-ping" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
              </span>
              Class Active — {item.schedule.course_code} (Room {item.schedule.room?.room_code ?? "—"})
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <button onClick={onEnd} className="py-3 rounded-lg text-sm font-bold text-rose-600 border-2 border-rose-200 bg-rose-50/30 hover:bg-rose-50 hover:border-rose-300 transition-all">
                End Session
              </button>
              <button onClick={onExtend} className="py-3 rounded-lg text-sm font-bold text-orange-600 border-2 border-orange-200 bg-orange-50/30 hover:bg-orange-50 hover:border-orange-300 transition-all">
                + Extend Session
              </button>
            </div>
          </div>
        )}

        {isEnRoute && (
          <div className="rounded-lg p-4 border border-orange-200 bg-orange-50/40 text-[12.5px] text-orange-700">
            En route declared. Room is held until you arrive — start the session normally when you reach the room.
          </div>
        )}

        {isFinal && (
          <div className="rounded-lg p-4 border border-slate-200 bg-slate-50 text-[12.5px] text-slate-500">
            This session is {session?.status}. {session?.duration_minutes != null && <span>Duration: {session.duration_minutes} min.</span>}
          </div>
        )}
      </div>
    </section>
  );
}

// ─── Activity feed helpers ──────────────────────────────────────────────────
function fmtRelativeDate(d: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today.getTime() - target.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(d).toLocaleDateString([], { month: "short", day: "numeric" });
}

function ActivityStatusIcon({ status }: { status: Session["status"] }) {
  const config: Record<string, { bg: string; fg: string; icon: React.ReactNode }> = {
    completed: {
      bg: "#d1fae5", fg: "#047857",
      icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>,
    },
    early_end: {
      bg: "#ffedd5", fg: "#c2410c",
      icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>,
    },
    absent: {
      bg: "#fee2e2", fg: "#b91c1c",
      icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>,
    },
    checker_flagged: {
      bg: "#fee2e2", fg: "#b91c1c",
      icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>,
    },
    overstay: {
      bg: "#fee2e2", fg: "#7f1d1d",
      icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /></svg>,
    },
    active: {
      bg: "#dcfce7", fg: "#15803d",
      icon: <span className="block w-1.5 h-1.5 rounded-full bg-current animate-pulse" />,
    },
    en_route: {
      bg: "#ffedd5", fg: "#c2410c",
      icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6" /></svg>,
    },
    scheduled: {
      bg: "#f1f5f9", fg: "#64748b",
      icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="4" y="6" width="16" height="14" rx="2" /></svg>,
    },
  };
  const c = config[status] ?? config.scheduled;
  return (
    <span
      className="w-7 h-7 rounded-md shrink-0 flex items-center justify-center mt-0.5"
      style={{ background: c.bg, color: c.fg }}
    >
      {c.icon}
    </span>
  );
}
