"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRealtimeChannel } from "@/hooks/use-realtime-channel";

type Status =
  | "scheduled"
  | "pending"
  | "active"
  | "en_route"
  | "completed"
  | "early_end"
  | "absent"
  | "overstay"
  | "checker_flagged";

type DayOfWeek = "mon" | "tue" | "wed" | "thu" | "fri" | "sat";

type LiveSession = {
  id: string;
  session_date: string;
  status: Status;
  actual_start: string | null;
  actual_end: string | null;
  duration_minutes: number | null;
  schedule_id: string;
  faculty_id: string;
  room_id: string;
  schedule: {
    course_code: string;
    course_name: string;
    section: string | null;
    enrolled_count: number;
    scheduled_modality: "f2f" | "blended" | "online";
    day_of_week: DayOfWeek;
    start_time: string;
    end_time: string;
  } | null;
  room: { room_code: string; building: string; floor_number: number } | null;
};

const DAYS: { key: DayOfWeek; label: string; short: string }[] = [
  { key: "mon", label: "Monday",    short: "Mon" },
  { key: "tue", label: "Tuesday",   short: "Tue" },
  { key: "wed", label: "Wednesday", short: "Wed" },
  { key: "thu", label: "Thursday",  short: "Thu" },
  { key: "fri", label: "Friday",    short: "Fri" },
  { key: "sat", label: "Saturday",  short: "Sat" },
];

const STATUS_STYLE: Record<Status, { bar: string; bg: string; text: string; label: string }> = {
  scheduled:       { bar: "#94a3b8", bg: "#f1f5f9", text: "#334155", label: "Scheduled" },
  pending:         { bar: "#f59e0b", bg: "#fef3c7", text: "#92400e", label: "Pending"   },
  active:          { bar: "#10b981", bg: "#d1fae5", text: "#065f46", label: "Active"    },
  en_route:        { bar: "#0ea5e9", bg: "#e0f2fe", text: "#075985", label: "En route"  },
  completed:       { bar: "#1e3a8a", bg: "#dbeafe", text: "#1e3a8a", label: "Completed" },
  early_end:       { bar: "#7c3aed", bg: "#ede9fe", text: "#5b21b6", label: "Early end" },
  absent:          { bar: "#ef4444", bg: "#fee2e2", text: "#991b1b", label: "Absent"    },
  overstay:        { bar: "#f43f5e", bg: "#ffe4e6", text: "#9f1239", label: "Overstay"  },
  checker_flagged: { bar: "#d97706", bg: "#fef3c7", text: "#78350f", label: "Flagged"   },
};

// Calendar grid spans 1 AM through 12 AM (midnight) — END_HOUR=24 represents
// the midnight tick at the bottom. The hour-label render special-cases 24 so
// it shows "12 AM" instead of "12 PM" (((24+11)%12)+1 would otherwise yield 12).
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
// YYYY-MM-DD in Manila local time. The seeded `session_date` column stores
// Manila dates, so we MUST match that — using `toISOString().slice(0,10)` here
// would silently shift to UTC and the wrong date would be queried for ~8 hours
// of every day.
function dateKey(d: Date): string {
  const ms = d.getTime() + 8 * 60 * 60 * 1000;
  const x = new Date(ms);
  const y = x.getUTCFullYear();
  const m = String(x.getUTCMonth() + 1).padStart(2, "0");
  const day = String(x.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function fmtDateRange(weekStart: Date): string {
  const weekEnd = addDays(weekStart, 5);
  const sameMonth = weekStart.getMonth() === weekEnd.getMonth();
  const sameYear = weekStart.getFullYear() === weekEnd.getFullYear();
  if (sameMonth && sameYear) {
    return `${weekStart.toLocaleDateString("en-PH", { month: "long" })} ${weekStart.getDate()} – ${weekEnd.getDate()}, ${weekStart.getFullYear()}`;
  }
  if (sameYear) {
    return `${weekStart.toLocaleDateString("en-PH", { month: "short", day: "numeric" })} – ${weekEnd.toLocaleDateString("en-PH", { month: "short", day: "numeric" })}, ${weekStart.getFullYear()}`;
  }
  return `${weekStart.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })} – ${weekEnd.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}`;
}

export default function FacultyLiveCalendarPage() {
  const [view, setView] = useState<"week" | "day">("week");
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<LiveSession | null>(null);
  const reloadRef = useRef<() => void>(() => {});

  const rangeFrom = view === "week" ? dateKey(weekStart) : dateKey(selectedDate);
  const rangeTo   = view === "week" ? dateKey(addDays(weekStart, 5)) : dateKey(selectedDate);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // /apis/sessions auto-scopes to the current faculty (see route.ts), so we
      // don't need to pass faculty_id explicitly here.
      const res = await fetch(`/apis/sessions?from=${rangeFrom}&to=${rangeTo}`, { cache: "no-store" });
      const json = await res.json();
      setSessions((json?.sessions ?? []) as LiveSession[]);
    } finally {
      setLoading(false);
    }
  }, [rangeFrom, rangeTo]);

  useEffect(() => {
    reloadRef.current = load;
    load();
  }, [load]);

  useRealtimeChannel("sessions", () => {
    reloadRef.current?.();
  });

  const byDate = useMemo(() => {
    const map = new Map<string, LiveSession[]>();
    sessions.forEach((s) => {
      const list = map.get(s.session_date) ?? [];
      list.push(s);
      map.set(s.session_date, list);
    });
    map.forEach((list) => list.sort((a, b) => {
      const aStart = a.schedule?.start_time ?? "00:00";
      const bStart = b.schedule?.start_time ?? "00:00";
      return aStart.localeCompare(bStart);
    }));
    return map;
  }, [sessions]);

  const statusCounts = useMemo(() => {
    const counts: Partial<Record<Status, number>> = {};
    sessions.forEach((s) => { counts[s.status] = (counts[s.status] ?? 0) + 1; });
    return counts;
  }, [sessions]);

  const today = new Date();
  const isCurrentWeek = sameDate(weekStart, startOfWeek(today));
  const todayKey = dateKey(today);
  const activeNow = useMemo(
    () => sessions.find((s) => (s.status === "active" || s.status === "en_route") && s.session_date === todayKey) ?? null,
    [sessions, todayKey],
  );
  const upNextToday = useMemo(
    () =>
      sessions
        .filter((s) => s.session_date === todayKey && (s.status === "scheduled" || s.status === "pending"))
        .sort((a, b) => (a.schedule?.start_time ?? "").localeCompare(b.schedule?.start_time ?? ""))[0] ?? null,
    [sessions, todayKey],
  );

  return (
    <div className="flex-1 flex flex-col fade-up min-h-0">
      <div className="px-4 sm:px-6 lg:px-8 pb-6 lg:pb-8 space-y-4 flex-1 flex flex-col min-h-0">
        <div className="card-surface card-primary p-5 lg:p-6">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="w-12 h-12 rounded-xl bg-blue-50 text-[#114b9f] flex items-center justify-center shrink-0">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
                <circle cx="18" cy="16" r="3" fill="#10b981" />
              </svg>
            </span>
            <div className="flex-1 min-w-0">
              <h1 className="text-headline text-[#001c43]">My Live Calendar</h1>
              <p className="text-[12.5px] text-slate-500 mt-0.5">
                Your sessions, updating in real time as you tap in
                <span className="ml-2 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold text-[10px]">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live
                </span>
              </p>
            </div>

            <div className="inline-flex rounded-xl bg-slate-100 p-1 shrink-0">
              <button
                onClick={() => setView("week")}
                className={`px-4 py-2 min-h-[40px] rounded-lg text-[13px] font-bold transition-all ${
                  view === "week" ? "bg-white text-[#001c43] shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                Week
              </button>
              <button
                onClick={() => setView("day")}
                className={`px-4 py-2 min-h-[40px] rounded-lg text-[13px] font-bold transition-all ${
                  view === "day" ? "bg-white text-[#001c43] shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                Day
              </button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 md:grid-cols-[auto_1fr_auto] items-center gap-3">
            <div className="flex items-center gap-2 justify-self-start">
              <button
                onClick={() => view === "week" ? setWeekStart((w) => addDays(w, -7)) : setSelectedDate((d) => addDays(d, -1))}
                aria-label={view === "week" ? "Previous week" : "Previous day"}
                className="w-11 h-11 rounded-xl border border-slate-200 bg-white hover:border-slate-300 flex items-center justify-center text-slate-600 hover:text-[#001c43] transition-all"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
              <button
                onClick={() => view === "week" ? setWeekStart((w) => addDays(w, 7)) : setSelectedDate((d) => addDays(d, 1))}
                aria-label={view === "week" ? "Next week" : "Next day"}
                className="w-11 h-11 rounded-xl border border-slate-200 bg-white hover:border-slate-300 flex items-center justify-center text-slate-600 hover:text-[#001c43] transition-all"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6" /></svg>
              </button>
              <button
                onClick={() => { setWeekStart(startOfWeek(new Date())); setSelectedDate(new Date()); }}
                disabled={view === "week" ? isCurrentWeek : sameDate(selectedDate, today)}
                className="ml-1 px-4 py-2.5 min-h-[44px] rounded-xl border border-slate-200 bg-white text-[13px] font-bold text-slate-700 hover:border-[#001c43] hover:text-[#001c43] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Today
              </button>
            </div>

            <div className="flex items-center justify-center gap-2 md:px-4">
              <p className="text-[15px] lg:text-[16px] font-bold text-[#001c43] tracking-tight text-center">
                {view === "week"
                  ? fmtDateRange(weekStart)
                  : selectedDate.toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
              </p>
            </div>

            <div aria-hidden />
          </div>
        </div>

        {/* "Now / Next" strip */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 lg:gap-4">
          <NowCard session={activeNow} />
          <UpNextCard session={upNextToday} hasActive={!!activeNow} />
        </div>

        {/* Status counters across the visible range */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
          {(Object.keys(STATUS_STYLE) as Status[]).filter((s) => s !== "pending" && s !== "checker_flagged").map((s) => {
            const meta = STATUS_STYLE[s];
            const count = statusCounts[s] ?? 0;
            return (
              <div key={s} className="card-surface p-3" style={{ borderLeft: `4px solid ${meta.bar}` }}>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{meta.label}</p>
                <p className="mt-1 text-[18px] font-bold text-[#001c43]">{count}</p>
              </div>
            );
          })}
        </div>

        {loading && (
          <div className="card-surface p-6"><div className="h-[480px] skeleton rounded-lg" /></div>
        )}

        {!loading && view === "week" && (
          <WeekGrid weekStart={weekStart} byDate={byDate} onSelect={setSelected} />
        )}
        {!loading && view === "day" && (
          <DayColumn date={selectedDate} sessions={byDate.get(dateKey(selectedDate)) ?? []} onSelect={setSelected} />
        )}
      </div>

      {selected && <SessionDetailModal session={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function NowCard({ session }: { session: LiveSession | null }) {
  if (!session) {
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
  const sched = session.schedule;
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
          {session.room?.room_code ? ` · Room ${session.room.room_code}` : ""}
          {session.actual_start ? ` · started ${new Date(session.actual_start).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })}` : ""}
        </p>
      </div>
    </div>
  );
}

function UpNextCard({ session, hasActive }: { session: LiveSession | null; hasActive: boolean }) {
  if (!session) {
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
  const sched = session.schedule;
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
          {session.room?.room_code ? ` · Room ${session.room.room_code}` : ""}
        </p>
      </div>
    </div>
  );
}

function WeekGrid({
  weekStart,
  byDate,
  onSelect,
}: {
  weekStart: Date;
  byDate: Map<string, LiveSession[]>;
  onSelect: (s: LiveSession) => void;
}) {
  const today = new Date();
  return (
    <div className="card-surface card-primary overflow-hidden flex-1 flex flex-col min-h-0">
      <div className="grid grid-cols-[44px_repeat(6,1fr)] sm:grid-cols-[64px_repeat(6,1fr)] border-b border-slate-200 bg-slate-50/60">
        <div className="p-3 text-[10.5px] font-bold text-slate-400 uppercase tracking-wider">GMT+8</div>
        {DAYS.map((d, i) => {
          const dayDate = addDays(weekStart, i);
          const isToday = sameDate(dayDate, today);
          return (
            <div
              key={d.key}
              className={`p-3 text-center border-l border-slate-200 ${isToday ? "bg-blue-50/50" : ""}`}
            >
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
        <div
          className="grid grid-cols-[44px_repeat(6,minmax(80px,1fr))] sm:grid-cols-[64px_repeat(6,minmax(140px,1fr))] relative"
          style={{ minHeight: TOTAL_HOURS * HOUR_HEIGHT }}
        >
          <div className="border-r border-slate-200 bg-slate-50/30">
            {Array.from({ length: TOTAL_HOURS }).map((_, i) => {
              const hour = START_HOUR + i;
              // hour=24 means the midnight tick at the bottom of the grid.
              // It's "12 AM", not "12 PM" — without the special case the
              // generic formula ((24+11)%12)+1 = 12 with am=false would print
              // "12 PM" there.
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
            const dayDate = addDays(weekStart, i);
            const items = byDate.get(dateKey(dayDate)) ?? [];
            const isToday = sameDate(dayDate, today);
            return (
              <div key={d.key} className={`relative border-l border-slate-200 ${isToday ? "bg-blue-50/20" : ""}`}>
                {Array.from({ length: TOTAL_HOURS }).map((_, j) => (
                  <div key={j} className="border-b border-slate-100" style={{ height: HOUR_HEIGHT }} />
                ))}
                {isToday && <NowLine />}
                {items.map((s) => {
                  if (!s.schedule) return null;
                  const { top, height } = classGeometry(s.schedule.start_time, s.schedule.end_time);
                  const sc = STATUS_STYLE[s.status];
                  const compact = height < 56;
                  return (
                    <button
                      key={s.id}
                      onClick={() => onSelect(s)}
                      className="absolute left-1.5 right-1.5 rounded-lg overflow-hidden shadow-sm border border-white/40 hover:shadow-md hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-[#114b9f] focus:ring-offset-1 transition-all cursor-pointer text-left"
                      style={{ top, height, background: sc.bg, borderLeft: `4px solid ${sc.bar}` }}
                      title={s.schedule.course_code}
                    >
                      <div className={`px-2.5 ${compact ? "py-1" : "py-1.5"} h-full flex flex-col`} style={{ color: sc.text }}>
                        <div className="flex items-center gap-1.5 min-w-0">
                          <p className="text-[12px] font-bold truncate">{s.schedule.course_code}</p>
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0 inline-flex items-center gap-1" style={{ background: sc.bar, color: "#fff" }}>
                            {s.status === "active" && <span className="w-1 h-1 rounded-full bg-white animate-pulse" />}
                            {sc.label}
                          </span>
                        </div>
                        {!compact && (
                          <>
                            <p className="text-[10.5px] opacity-80 truncate">{fmtTime(s.schedule.start_time)} – {fmtTime(s.schedule.end_time)}</p>
                            <p className="text-[10.5px] opacity-70 truncate mt-auto">
                              {s.room?.room_code ? `Room ${s.room.room_code}` : "—"}
                              {s.schedule.section ? ` · ${s.schedule.section}` : ""}
                            </p>
                          </>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      <Legend />
    </div>
  );
}

function DayColumn({
  date,
  sessions,
  onSelect,
}: {
  date: Date;
  sessions: LiveSession[];
  onSelect: (s: LiveSession) => void;
}) {
  const isToday = sameDate(date, new Date());
  return (
    <div className="card-surface card-primary overflow-hidden flex-1 flex flex-col min-h-0">
      <div className="p-4 border-b border-slate-200 bg-slate-50/60 flex items-center justify-between">
        <p className="text-[13px] font-bold text-[#001c43]">
          {date.toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric" })}
          {isToday && <span className="ml-2 px-2 py-0.5 rounded-full bg-blue-100 text-[#114b9f] text-[10px]">Today</span>}
        </p>
        <p className="text-[11px] text-slate-500">{sessions.length} session{sessions.length === 1 ? "" : "s"}</p>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="grid grid-cols-[80px_1fr] relative" style={{ minHeight: TOTAL_HOURS * HOUR_HEIGHT }}>
          <div className="border-r border-slate-200 bg-slate-50/30">
            {Array.from({ length: TOTAL_HOURS }).map((_, i) => {
              const hour = START_HOUR + i;
              // hour=24 means the midnight tick at the bottom of the grid.
              // It's "12 AM", not "12 PM" — without the special case the
              // generic formula ((24+11)%12)+1 = 12 with am=false would print
              // "12 PM" there.
              const am = hour < 12 || hour === 24;
              const hh = hour === 24 ? 12 : ((hour + 11) % 12) + 1;
              return (
                <div key={hour} className="text-right pr-3 text-[10.5px] text-slate-400 font-medium relative" style={{ height: HOUR_HEIGHT }}>
                  <span className="absolute -top-1.5 right-3">{hh} {am ? "AM" : "PM"}</span>
                </div>
              );
            })}
          </div>
          <div className="relative">
            {Array.from({ length: TOTAL_HOURS }).map((_, j) => (
              <div key={j} className="border-b border-slate-100" style={{ height: HOUR_HEIGHT }} />
            ))}
            {isToday && <NowLine />}
            {sessions.map((s) => {
              if (!s.schedule) return null;
              const { top, height } = classGeometry(s.schedule.start_time, s.schedule.end_time);
              const sc = STATUS_STYLE[s.status];
              return (
                <button
                  key={s.id}
                  onClick={() => onSelect(s)}
                  className="absolute left-3 right-3 rounded-lg overflow-hidden shadow-sm border border-white/40 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#114b9f] transition-all cursor-pointer text-left"
                  style={{ top, height, background: sc.bg, borderLeft: `4px solid ${sc.bar}` }}
                >
                  <div className="px-3 py-2 h-full flex flex-col" style={{ color: sc.text }}>
                    <div className="flex items-center gap-2 min-w-0">
                      <p className="text-[14px] font-bold truncate">{s.schedule.course_code}</p>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider shrink-0 inline-flex items-center gap-1" style={{ background: sc.bar, color: "#fff" }}>
                        {s.status === "active" && <span className="w-1 h-1 rounded-full bg-white animate-pulse" />}
                        {sc.label}
                      </span>
                      <span className="text-[11px] opacity-70 truncate">{s.schedule.section ?? ""}</span>
                    </div>
                    <p className="text-[12px] opacity-90 truncate mt-0.5">{s.schedule.course_name}</p>
                    <p className="text-[11px] opacity-70 truncate mt-auto">
                      {s.room?.room_code ? `Room ${s.room.room_code}` : "—"}
                      {" · "}{fmtTime(s.schedule.start_time)}–{fmtTime(s.schedule.end_time)}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <Legend />
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

function Legend() {
  return (
    <div className="px-4 py-3 border-t border-slate-100 flex items-center gap-3 flex-wrap text-[11px] text-slate-500">
      <span className="font-bold text-slate-600 uppercase tracking-wider mr-1">Status:</span>
      {(Object.keys(STATUS_STYLE) as Status[]).map((s) => (
        <span key={s} className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded" style={{ background: STATUS_STYLE[s].bar }} />
          {STATUS_STYLE[s].label}
        </span>
      ))}
    </div>
  );
}

function SessionDetailModal({ session, onClose }: { session: LiveSession; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const sc = STATUS_STYLE[session.status];
  const sched = session.schedule;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 sm:p-6 fade-up" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden my-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-7 py-7 sm:px-8 sm:py-8 relative" style={{ background: `linear-gradient(135deg, ${sc.bar} 0%, ${sc.bar}dd 100%)` }}>
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute top-5 right-5 w-9 h-9 rounded-lg bg-white/15 hover:bg-white/25 backdrop-blur-sm text-white flex items-center justify-center transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/15 border border-white/20 backdrop-blur-sm text-[10.5px] font-bold tracking-wider uppercase text-white mb-4 mr-12">
            {sc.label}{sched?.section ? ` · ${sched.section}` : ""}
          </span>
          <h2 className="text-[22px] font-bold text-white leading-tight tracking-tight pr-12">
            {sched?.course_code ?? "Session"}
          </h2>
          <p className="text-[14px] text-white/85 leading-snug mt-1 pr-2">{sched?.course_name ?? "—"}</p>
        </div>
        <div className="px-7 py-7 sm:px-8 sm:py-8 space-y-4 text-[13.5px]">
          <Row
            label="Scheduled"
            value={sched ? `${fmtTime(sched.start_time)} – ${fmtTime(sched.end_time)}` : "—"}
            sub={session.session_date}
          />
          <Row
            label="Actual"
            value={session.actual_start ? new Date(session.actual_start).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" }) : "Not started"}
            sub={session.actual_end ? `Ended ${new Date(session.actual_end).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })}${session.duration_minutes ? ` · ${session.duration_minutes}m` : ""}` : ""}
          />
          <Row label="Room" value={session.room ? `Room ${session.room.room_code}` : "—"} sub={session.room ? `${session.room.building} · Floor ${session.room.floor_number}` : ""} />
          <Row label="Section" value={sched?.section ?? "—"} sub={sched?.enrolled_count ? `${sched.enrolled_count} students` : ""} />
        </div>
        <div className="px-7 py-5 sm:px-8 bg-slate-50/60 border-t border-slate-100 flex justify-end">
          <button onClick={onClose} className="px-6 py-2.5 min-h-[44px] rounded-xl text-[13px] font-bold border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 transition-colors">Close</button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="grid grid-cols-[100px_1fr] items-baseline gap-3">
      <p className="text-[10.5px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
      <div>
        <p className="font-bold text-[#001c43]">{value}</p>
        {sub && <p className="text-[11.5px] text-slate-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}
