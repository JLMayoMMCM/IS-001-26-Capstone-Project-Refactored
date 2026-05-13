"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRealtimeChannel } from "@/hooks/use-realtime-channel";

type Modality = "f2f" | "blended" | "online";
type DayOfWeek = "mon" | "tue" | "wed" | "thu" | "fri" | "sat";

type Schedule = {
  id: string;
  course_code: string;
  course_name: string;
  section: string | null;
  enrolled_count: number;
  scheduled_modality: Modality;
  day_of_week: DayOfWeek;
  start_time: string;
  end_time: string;
  academic_term: string;
  is_active: boolean;
  faculty_id: string;
  room: { id: string; room_code: string; building: string; floor_number: number } | null;
};

type SessionStatus =
  | "scheduled"
  | "pending"
  | "active"
  | "en_route"
  | "completed"
  | "early_end"
  | "absent"
  | "overstay"
  | "checker_flagged";

type LiveSession = {
  id: string;
  session_date: string;
  status: SessionStatus;
  schedule_id: string;
  faculty_id: string;
  actual_start: string | null;
  actual_end: string | null;
  duration_minutes: number | null;
  schedule: {
    course_code: string;
    course_name: string;
    section: string | null;
    start_time: string;
    end_time: string;
  } | null;
  room: { room_code: string; building: string; floor_number: number } | null;
};

type FacultyUser = {
  id: string;
  full_name: string;
  email: string;
  faculty_id: string | null;
  department: string | null;
  employment_type: "full_time" | "part_time" | null;
};

const DAYS: { key: DayOfWeek; label: string; short: string }[] = [
  { key: "mon", label: "Monday",    short: "Mon" },
  { key: "tue", label: "Tuesday",   short: "Tue" },
  { key: "wed", label: "Wednesday", short: "Wed" },
  { key: "thu", label: "Thursday",  short: "Thu" },
  { key: "fri", label: "Friday",    short: "Fri" },
  { key: "sat", label: "Saturday",  short: "Sat" },
];

const MOD: Record<Modality, { bar: string; bg: string; text: string; label: string }> = {
  f2f:     { bar: "#1e3a8a", bg: "#dbeafe", text: "#1e3a8a", label: "F2F" },
  blended: { bar: "#7c3aed", bg: "#ede9fe", text: "#5b21b6", label: "Hybrid" },
  online:  { bar: "#0d9488", bg: "#ccfbf1", text: "#115e59", label: "Online" },
};

// 1 AM → midnight grid; END_HOUR=24 is the midnight tick at the bottom.
const START_HOUR = 1;
const END_HOUR = 24;
const HOUR_HEIGHT = 56;
const TOTAL_HOURS = END_HOUR - START_HOUR;

function fmtTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  const am = h < 12;
  const hh = ((h + 11) % 12) + 1;
  return `${hh}:${m.toString().padStart(2, "0")} ${am ? "AM" : "PM"}`;
}
function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function classGeometry(start: string, end: string) {
  const startMins = timeToMinutes(start) - START_HOUR * 60;
  const endMins = timeToMinutes(end) - START_HOUR * 60;
  const top = (startMins / 60) * HOUR_HEIGHT;
  const height = Math.max(28, ((endMins - startMins) / 60) * HOUR_HEIGHT);
  return { top, height };
}
function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}
function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}
function sameDate(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function initials(name: string): string {
  return name.split(" ").map((p) => p[0] ?? "").slice(0, 2).join("").toUpperCase();
}

export default function FacultyDetailPage() {
  const params = useParams<{ id: string }>();
  const facultyId = params?.id ?? "";
  const [faculty, setFaculty] = useState<FacultyUser | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [liveSessions, setLiveSessions] = useState<LiveSession[]>([]);
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const [loading, setLoading] = useState(true);
  const reloadRef = useRef<() => void>(() => {});

  const load = useCallback(async () => {
    if (!facultyId) return;
    setLoading(true);
    try {
      const from = dateKey(addDays(weekStart, -7));   // include last week for "recent" history
      const to   = dateKey(addDays(weekStart, 12));   // include next week for upcoming
      const [userRes, schedRes, sessRes] = await Promise.all([
        fetch(`/apis/users/${facultyId}`, { cache: "no-store" }).catch(() => null),
        fetch(`/apis/schedules?faculty_id=${facultyId}`, { cache: "no-store" }),
        fetch(`/apis/sessions?faculty_id=${facultyId}&from=${from}&to=${to}`, { cache: "no-store" }),
      ]);
      const userJson = userRes ? await userRes.json().catch(() => null) : null;
      const schedJson = await schedRes.json().catch(() => ({ schedules: [] }));
      const sessJson = await sessRes.json().catch(() => ({ sessions: [] }));
      setFaculty((userJson?.user ?? null) as FacultyUser | null);
      setSchedules(((schedJson?.schedules ?? []) as Schedule[]).filter((s) => s.faculty_id === facultyId));
      setLiveSessions((sessJson?.sessions ?? []) as LiveSession[]);
    } finally {
      setLoading(false);
    }
  }, [facultyId, weekStart]);

  useEffect(() => {
    reloadRef.current = load;
    load();
  }, [load]);

  // Re-pull when this faculty's sessions change so status overlays stay live.
  useRealtimeChannel({
    table: "sessions",
    filter: `faculty_id=eq.${facultyId}`,
    onChange: () => reloadRef.current?.(),
  });

  const byDay = useMemo(() => {
    const map = new Map<DayOfWeek, Schedule[]>();
    DAYS.forEach((d) => map.set(d.key, []));
    schedules.filter((s) => s.is_active).forEach((s) => {
      map.get(s.day_of_week)?.push(s);
    });
    map.forEach((list) => list.sort((a, b) => a.start_time.localeCompare(b.start_time)));
    return map;
  }, [schedules]);

  // Map schedule_id → today's session (if any) so we can paint a live status
  // pill on the matching grid cell.
  const sessionByScheduleOnDate = useMemo(() => {
    const map = new Map<string, LiveSession>();
    liveSessions.forEach((s) => {
      const key = `${s.schedule_id}|${s.session_date}`;
      map.set(key, s);
    });
    return map;
  }, [liveSessions]);

  const totalHours = useMemo(
    () => schedules.filter((s) => s.is_active).reduce((sum, s) => sum + (timeToMinutes(s.end_time) - timeToMinutes(s.start_time)) / 60, 0),
    [schedules],
  );
  const sectionCount = useMemo(
    () => new Set(schedules.filter((s) => s.is_active).map((s) => s.section).filter(Boolean)).size,
    [schedules],
  );

  // This-week metrics: counts by status across sessions falling in the
  // visible week. Drives the four KPI tiles + the compliance %.
  const weekStats = useMemo(() => {
    const weekFrom = dateKey(weekStart);
    const weekTo   = dateKey(addDays(weekStart, 5));
    const inWeek = liveSessions.filter((s) => s.session_date >= weekFrom && s.session_date <= weekTo);
    const total = inWeek.length;
    const completed = inWeek.filter((s) => s.status === "completed" || s.status === "early_end").length;
    const absent    = inWeek.filter((s) => s.status === "absent").length;
    const flagged   = inWeek.filter((s) => s.status === "overstay" || s.status === "checker_flagged").length;
    const live      = inWeek.filter((s) => s.status === "active" || s.status === "en_route").length;
    // Compliance = completed / (completed + absent + flagged) — excludes still-pending.
    const judged = completed + absent + flagged;
    const compliance = judged === 0 ? null : Math.round((completed / judged) * 100);
    return { total, completed, absent, flagged, live, compliance };
  }, [liveSessions, weekStart]);

  // "Now teaching" & "Up next" derived from today's sessions.
  const todayKey = dateKey(new Date());
  const nowAndNext = useMemo(() => {
    const today = liveSessions.filter((s) => s.session_date === todayKey);
    const active = today.find((s) => s.status === "active" || s.status === "en_route") ?? null;
    const upcoming = today
      .filter((s) => s.status === "scheduled" || s.status === "pending")
      .sort((a, b) => (a.schedule?.start_time ?? "").localeCompare(b.schedule?.start_time ?? ""))[0] ?? null;
    return { active, upcoming };
  }, [liveSessions, todayKey]);

  // Most recent ≤ 8 completed/absent/flagged sessions (history feed under the calendar).
  const recent = useMemo(
    () =>
      liveSessions
        .filter((s) => s.status !== "scheduled" && s.status !== "pending" && s.session_date <= todayKey)
        .sort((a, b) => {
          // Most recent first: by date desc, then actual_start desc.
          if (a.session_date !== b.session_date) return b.session_date.localeCompare(a.session_date);
          return (b.actual_start ?? "").localeCompare(a.actual_start ?? "");
        })
        .slice(0, 8),
    [liveSessions, todayKey],
  );

  const today = new Date();
  const isCurrentWeek = sameDate(weekStart, startOfWeek(today));

  return (
    <div className="flex-1 flex flex-col fade-up min-h-0">
      <div className="px-4 sm:px-6 lg:px-8 pb-6 lg:pb-8 space-y-4 flex-1 flex flex-col min-h-0">
        {/* Breadcrumb + header */}
        <div className="card-surface p-5 lg:p-6">
          <Link href="/ifo/ifo-faculty" className="text-[11px] text-slate-500 hover:text-[#114b9f] inline-flex items-center gap-1 mb-3">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
            All faculty
          </Link>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="w-14 h-14 rounded-xl bg-blue-100 text-blue-700 font-bold text-[16px] flex items-center justify-center shrink-0">
              {initials(faculty?.full_name ?? "?")}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-headline text-[#001c43]">{faculty?.full_name ?? "Loading…"}</h1>
              <p className="text-[12.5px] text-slate-500 mt-0.5">
                {faculty?.email ?? ""}
                {faculty?.department && <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-bold text-[10px]">{faculty.department}</span>}
                {faculty?.employment_type && (
                  <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
                    style={{
                      background: faculty.employment_type === "full_time" ? "#dcfce7" : "#fef3c7",
                      color: faculty.employment_type === "full_time" ? "#166534" : "#92400e",
                    }}
                  >
                    {faculty.employment_type === "full_time" ? "Full-time" : "Part-time"}
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setWeekStart((w) => addDays(w, -7))}
                className="w-11 h-11 rounded-xl border border-slate-200 bg-white hover:border-slate-300 flex items-center justify-center text-slate-600"
                aria-label="Previous week"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
              <button
                onClick={() => setWeekStart(startOfWeek(new Date()))}
                disabled={isCurrentWeek}
                className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-[13px] font-bold text-slate-700 hover:border-[#001c43] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                This week
              </button>
              <button
                onClick={() => setWeekStart((w) => addDays(w, 7))}
                className="w-11 h-11 rounded-xl border border-slate-200 bg-white hover:border-slate-300 flex items-center justify-center text-slate-600"
                aria-label="Next week"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6" /></svg>
              </button>
            </div>
          </div>
        </div>

        {/* Live "now" / "next" row — shows current activity for the faculty */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 lg:gap-4">
          <NowCard active={nowAndNext.active} />
          <UpNextCard upcoming={nowAndNext.upcoming} hasActive={!!nowAndNext.active} />
        </div>

        {/* Term stats + this-week status counters */}
        <div className="grid grid-cols-3 sm:grid-cols-3 lg:grid-cols-7 gap-3 lg:gap-4">
          <Card label="Active Classes" value={`${schedules.filter((s) => s.is_active).length}`} />
          <Card label="Weekly Hours"   value={`${totalHours.toFixed(1)} hrs`} />
          <Card label="Sections"       value={`${sectionCount}`} />
          <Card label="This Week"      value={`${weekStats.total} sessions`} />
          <Card label="Completed"      value={`${weekStats.completed}`} accent="#10b981" />
          <Card label="Absent / Flag"  value={`${weekStats.absent + weekStats.flagged}`} accent={weekStats.absent + weekStats.flagged > 0 ? "#ef4444" : undefined} />
          <Card label="Compliance"     value={weekStats.compliance === null ? "—" : `${weekStats.compliance}%`} accent={weekStats.compliance !== null && weekStats.compliance >= 90 ? "#10b981" : weekStats.compliance !== null && weekStats.compliance < 80 ? "#ef4444" : undefined} />
        </div>

        {loading ? (
          <div className="card-surface p-6"><div className="h-[480px] skeleton rounded-lg" /></div>
        ) : schedules.length === 0 ? (
          <div className="card-surface p-12 text-center text-slate-400 text-sm">No classes for this faculty in the active term.</div>
        ) : (
          <div className="card-surface overflow-hidden flex-1 flex flex-col min-h-0">
            <div className="grid grid-cols-[64px_repeat(6,1fr)] border-b border-slate-200 bg-slate-50/60">
              <div className="p-3 text-[10.5px] font-bold text-slate-400 uppercase tracking-wider">GMT+8</div>
              {DAYS.map((d, i) => {
                const dayDate = addDays(weekStart, i);
                const isToday = sameDate(dayDate, today);
                return (
                  <div key={d.key} className={`p-3 text-center border-l border-slate-200 ${isToday ? "bg-blue-50/50" : ""}`}>
                    <p className="text-[10.5px] font-bold text-slate-400 uppercase tracking-wider">{d.short}</p>
                    <p className={`mt-1 text-[16px] font-bold ${isToday ? "text-[#114b9f]" : "text-[#001c43]"}`}>
                      {dayDate.getDate()}
                      {isToday && <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-[#114b9f] align-middle" />}
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="flex-1 min-h-0 overflow-x-auto overflow-y-auto">
              <div className="grid grid-cols-[64px_repeat(6,minmax(140px,1fr))] relative" style={{ minHeight: TOTAL_HOURS * HOUR_HEIGHT }}>
                <div className="border-r border-slate-200 bg-slate-50/30">
                  {Array.from({ length: TOTAL_HOURS }).map((_, i) => {
                    const hour = START_HOUR + i;
                    // hour=24 is the midnight tick — render "12 AM".
                    const am = hour < 12 || hour === 24;
                    const hh = hour === 24 ? 12 : ((hour + 11) % 12) + 1;
                    return (
                      <div key={hour} className="text-right pr-2 text-[10.5px] text-slate-400 font-medium relative" style={{ height: HOUR_HEIGHT }}>
                        <span className="absolute -top-1.5 right-2">{hh} {am ? "AM" : "PM"}</span>
                      </div>
                    );
                  })}
                </div>

                {DAYS.map((d, i) => {
                  const items = byDay.get(d.key) ?? [];
                  const dayDate = addDays(weekStart, i);
                  const isToday = sameDate(dayDate, today);
                  return (
                    <div key={d.key} className={`relative border-l border-slate-200 ${isToday ? "bg-blue-50/20" : ""}`}>
                      {Array.from({ length: TOTAL_HOURS }).map((_, j) => (
                        <div key={j} className="border-b border-slate-100" style={{ height: HOUR_HEIGHT }} />
                      ))}
                      {isToday && <NowLine />}
                      {items.map((cls) => {
                        const { top, height } = classGeometry(cls.start_time, cls.end_time);
                        const mc = MOD[cls.scheduled_modality];
                        const compact = height < 56;
                        const live = sessionByScheduleOnDate.get(`${cls.id}|${dateKey(dayDate)}`);
                        return (
                          <div
                            key={cls.id}
                            className="absolute left-1.5 right-1.5 rounded-lg overflow-hidden shadow-sm border border-white/40 transition-all text-left"
                            style={{ top, height, background: mc.bg, borderLeft: `4px solid ${mc.bar}` }}
                            title={`${cls.course_code} · ${cls.course_name}`}
                          >
                            <div className={`px-2.5 ${compact ? "py-1" : "py-1.5"} h-full flex flex-col`} style={{ color: mc.text }}>
                              <div className="flex items-center gap-1.5 min-w-0">
                                <p className="text-[12px] font-bold truncate">{cls.course_code}</p>
                                {live && <LiveStatusChip status={live.status} />}
                                {!live && (
                                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0" style={{ background: mc.bar, color: "#fff" }}>
                                    {mc.label}
                                  </span>
                                )}
                              </div>
                              {!compact && (
                                <>
                                  <p className="text-[10.5px] opacity-80 truncate">{fmtTime(cls.start_time)} – {fmtTime(cls.end_time)}</p>
                                  <p className="text-[10.5px] opacity-70 truncate mt-auto">
                                    {cls.room?.room_code ? `Room ${cls.room.room_code}` : "—"}
                                    {cls.section ? ` · ${cls.section}` : ""}
                                  </p>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Recent activity — last 8 finished (or otherwise judged) sessions. */}
        {!loading && recent.length > 0 && (
          <div className="card-surface overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
              <p className="text-[12px] font-bold text-slate-600 uppercase tracking-wider">Recent Sessions</p>
              <p className="text-[11px] text-slate-400">{recent.length} most recent</p>
            </div>
            <ul className="divide-y divide-slate-100">
              {recent.map((s) => <RecentSessionRow key={s.id} session={s} />)}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function NowCard({ active }: { active: LiveSession | null }) {
  if (!active) {
    return (
      <div className="card-surface p-4 flex items-center gap-3">
        <span className="w-10 h-10 rounded-lg bg-slate-100 text-slate-400 flex items-center justify-center">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[10.5px] font-bold text-slate-400 uppercase tracking-wider">Now Teaching</p>
          <p className="text-[13px] text-slate-500 mt-0.5">No active class right now.</p>
        </div>
      </div>
    );
  }
  const sched = active.schedule;
  return (
    <div className="card-surface p-4 flex items-center gap-3" style={{ borderLeft: "4px solid #10b981" }}>
      <span className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[10.5px] font-bold text-emerald-700 uppercase tracking-wider">Now Teaching · Live</p>
        <p className="text-[14px] font-bold text-[#001c43] mt-0.5 truncate">
          {sched?.course_code ?? "Active session"}
          {sched?.section ? <span className="text-slate-500 font-medium"> · {sched.section}</span> : null}
        </p>
        <p className="text-[11.5px] text-slate-500 truncate">
          {sched ? `${fmtTime(sched.start_time)}–${fmtTime(sched.end_time)}` : "—"}
          {active.room?.room_code ? ` · Room ${active.room.room_code}` : ""}
          {active.actual_start ? ` · started ${new Date(active.actual_start).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })}` : ""}
        </p>
      </div>
    </div>
  );
}

function UpNextCard({ upcoming, hasActive }: { upcoming: LiveSession | null; hasActive: boolean }) {
  if (!upcoming) {
    return (
      <div className="card-surface p-4 flex items-center gap-3">
        <span className="w-10 h-10 rounded-lg bg-slate-100 text-slate-400 flex items-center justify-center">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="12 6 12 12 16 14" /><circle cx="12" cy="12" r="10" /></svg>
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[10.5px] font-bold text-slate-400 uppercase tracking-wider">Up Next Today</p>
          <p className="text-[13px] text-slate-500 mt-0.5">No more classes today.</p>
        </div>
      </div>
    );
  }
  const sched = upcoming.schedule;
  return (
    <div className="card-surface p-4 flex items-center gap-3" style={{ borderLeft: `4px solid ${hasActive ? "#94a3b8" : "#0ea5e9"}` }}>
      <span className="w-10 h-10 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="5 12 19 12" /><polyline points="12 5 19 12 12 19" /></svg>
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[10.5px] font-bold text-sky-700 uppercase tracking-wider">Up Next Today</p>
        <p className="text-[14px] font-bold text-[#001c43] mt-0.5 truncate">
          {sched?.course_code ?? "Upcoming"}
          {sched?.section ? <span className="text-slate-500 font-medium"> · {sched.section}</span> : null}
        </p>
        <p className="text-[11.5px] text-slate-500 truncate">
          {sched ? `${fmtTime(sched.start_time)}–${fmtTime(sched.end_time)}` : "—"}
          {upcoming.room?.room_code ? ` · Room ${upcoming.room.room_code}` : ""}
        </p>
      </div>
    </div>
  );
}

function RecentSessionRow({ session }: { session: LiveSession }) {
  const meta = STATUS_META[session.status];
  const sched = session.schedule;
  const date = new Date(session.session_date + "T00:00:00");
  return (
    <li className="px-5 py-3 flex items-center gap-3 hover:bg-slate-50/60">
      <div className="w-1.5 self-stretch rounded-full" style={{ background: meta.bg }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-[13px] font-bold text-[#001c43]">{sched?.course_code ?? "Session"}</p>
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider" style={{ background: meta.bg, color: "#fff" }}>
            {meta.label}
          </span>
          {sched?.section && <span className="text-[10.5px] text-slate-500">{sched.section}</span>}
        </div>
        <p className="text-[11.5px] text-slate-500 truncate mt-0.5">
          {date.toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric" })}
          {sched ? ` · ${fmtTime(sched.start_time)}–${fmtTime(sched.end_time)}` : ""}
          {session.room?.room_code ? ` · Room ${session.room.room_code}` : ""}
        </p>
      </div>
      {session.duration_minutes != null && (
        <p className="text-[11px] font-bold text-slate-500 shrink-0">{session.duration_minutes}m</p>
      )}
    </li>
  );
}

const STATUS_META: Record<SessionStatus, { bg: string; label: string }> = {
  scheduled:       { bg: "#94a3b8", label: "Scheduled" },
  pending:         { bg: "#f59e0b", label: "Pending"   },
  active:          { bg: "#10b981", label: "Live"      },
  en_route:        { bg: "#0ea5e9", label: "En route"  },
  completed:       { bg: "#1e3a8a", label: "Done"      },
  early_end:       { bg: "#7c3aed", label: "Early"     },
  absent:          { bg: "#ef4444", label: "Absent"    },
  overstay:        { bg: "#f43f5e", label: "Overstay"  },
  checker_flagged: { bg: "#d97706", label: "Flagged"   },
};

function Card({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="card-surface p-4" style={accent ? { borderLeft: `4px solid ${accent}` } : undefined}>
      <p className="text-overline">{label}</p>
      <p className="mt-1 text-[14px] font-bold text-[#001c43] truncate">{value}</p>
    </div>
  );
}

function NowLine() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  const mins = now.getHours() * 60 + now.getMinutes() - START_HOUR * 60;
  if (mins < 0 || mins > TOTAL_HOURS * 60) return null;
  const top = (mins / 60) * HOUR_HEIGHT;
  return (
    <div className="absolute left-0 right-0 z-10 pointer-events-none" style={{ top }}>
      <div className="relative h-0.5 bg-rose-500">
        <span className="absolute -left-1 -top-1 w-2.5 h-2.5 rounded-full bg-rose-500 ring-2 ring-white" />
      </div>
    </div>
  );
}

function LiveStatusChip({ status }: { status: SessionStatus }) {
  const m = STATUS_META[status];
  return (
    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0 inline-flex items-center gap-1" style={{ background: m.bg, color: "#fff" }}>
      {status === "active" && <span className="w-1 h-1 rounded-full bg-white animate-pulse" />}
      {m.label}
    </span>
  );
}
