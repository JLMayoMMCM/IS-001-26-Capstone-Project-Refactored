"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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

const DAYS: { key: DayOfWeek; label: string; short: string; jsDay: number }[] = [
  { key: "mon", label: "Monday",    short: "Mon", jsDay: 1 },
  { key: "tue", label: "Tuesday",   short: "Tue", jsDay: 2 },
  { key: "wed", label: "Wednesday", short: "Wed", jsDay: 3 },
  { key: "thu", label: "Thursday",  short: "Thu", jsDay: 4 },
  { key: "fri", label: "Friday",    short: "Fri", jsDay: 5 },
  { key: "sat", label: "Saturday",  short: "Sat", jsDay: 6 },
];

const MOD: Record<Modality, { bar: string; bg: string; text: string; label: string }> = {
  f2f:     { bar: "#1e3a8a", bg: "#dbeafe", text: "#1e3a8a", label: "F2F" },
  blended: { bar: "#7c3aed", bg: "#ede9fe", text: "#5b21b6", label: "Hybrid" },
  online:  { bar: "#0d9488", bg: "#ccfbf1", text: "#115e59", label: "Online" },
};

const START_HOUR = 7;
const END_HOUR = 21;
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

function durationHours(start: string, end: string) {
  return (timeToMinutes(end) - timeToMinutes(start)) / 60;
}

function classGeometry(start: string, end: string) {
  const startMins = timeToMinutes(start) - START_HOUR * 60;
  const endMins = timeToMinutes(end) - START_HOUR * 60;
  const top = (startMins / 60) * HOUR_HEIGHT;
  const height = Math.max(28, ((endMins - startMins) / 60) * HOUR_HEIGHT);
  return { top, height };
}

/** Find the Monday of the week containing the given date (in local TZ). */
function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day; // Monday-based week
  d.setDate(d.getDate() + diff);
  return d;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function sameDate(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
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

export default function SchedulePage() {
  const [me, setMe] = useState<{ full_name: string; department: string | null } | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"week" | "list">("week");
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const [selected, setSelected] = useState<Schedule | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [meRes, schedRes] = await Promise.all([
        fetch("/apis/users/me", { cache: "no-store" }),
        fetch("/apis/schedules", { cache: "no-store" }),
      ]);
      const meJson = await meRes.json();
      const schedJson = await schedRes.json();
      setMe(meJson?.user ?? null);
      setSchedules(schedJson?.schedules ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const byDay = useMemo(() => {
    const map = new Map<DayOfWeek, Schedule[]>();
    DAYS.forEach((d) => map.set(d.key, []));
    schedules.forEach((s) => {
      const list = map.get(s.day_of_week);
      if (list) list.push(s);
    });
    map.forEach((list) => list.sort((a, b) => a.start_time.localeCompare(b.start_time)));
    return map;
  }, [schedules]);

  const stats = useMemo(() => {
    const total = schedules.length;
    const weeklyHours = schedules.reduce((sum, s) => sum + durationHours(s.start_time, s.end_time), 0);
    const modalitySet = new Set(schedules.map((s) => s.scheduled_modality));
    return {
      total: `${total} ${total === 1 ? "course" : "courses"}`,
      weekly: `${weeklyHours.toFixed(1)} hrs`,
      modalities: Array.from(modalitySet).map((m) => MOD[m].label).join(" + ") || "—",
    };
  }, [schedules]);

  const today = new Date();
  const isCurrentWeek = sameDate(weekStart, startOfWeek(today));

  const goPrev = () => setWeekStart((w) => addDays(w, -7));
  const goNext = () => setWeekStart((w) => addDays(w, 7));
  const goToday = () => setWeekStart(startOfWeek(new Date()));

  return (
    <div className="flex-1 flex flex-col fade-up min-h-0">
            <div className="px-4 sm:px-6 lg:px-8 pb-6 lg:pb-8 space-y-4 flex-1 flex flex-col min-h-0">
        {/* Header card with view toggle and week nav */}
        <div className="card-surface p-5 lg:p-6">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="w-12 h-12 rounded-xl bg-blue-50 text-[#114b9f] flex items-center justify-center shrink-0">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </span>
            <div className="flex-1 min-w-0">
              <h1 className="text-headline text-[#001c43]">My Schedule</h1>
              <p className="text-[12.5px] text-slate-500 mt-0.5">
                {schedules[0]?.academic_term ?? "Current Term"}
                <span className="px-2 py-0.5 ml-2 rounded-full bg-blue-100 text-blue-700 font-bold text-[10px]">Active</span>
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
                onClick={() => setView("list")}
                className={`px-4 py-2 min-h-[40px] rounded-lg text-[13px] font-bold transition-all ${
                  view === "list" ? "bg-white text-[#001c43] shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                List
              </button>
            </div>
          </div>

          {/* Week navigation strip — 3-cluster grid: prev/next/Today | centered date | spacer.
              On wrap (~768px and below), grid collapses naturally and items stack. */}
          <div className="mt-5 grid grid-cols-1 md:grid-cols-[auto_1fr_auto] items-center gap-3">
            <div className="flex items-center gap-2 justify-self-start">
              <button
                onClick={goPrev}
                aria-label="Previous week"
                className="w-11 h-11 rounded-xl border border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm flex items-center justify-center text-slate-600 hover:text-[#001c43] transition-all"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <button
                onClick={goNext}
                aria-label="Next week"
                className="w-11 h-11 rounded-xl border border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm flex items-center justify-center text-slate-600 hover:text-[#001c43] transition-all"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
              <button
                onClick={goToday}
                disabled={isCurrentWeek}
                className="ml-1 px-4 py-2.5 min-h-[44px] rounded-xl border border-slate-200 bg-white text-[13px] font-bold text-slate-700 hover:border-[#001c43] hover:text-[#001c43] transition-all disabled:opacity-50 disabled:hover:border-slate-200 disabled:hover:text-slate-700 disabled:cursor-not-allowed"
              >
                Today
              </button>
            </div>

            <div className="flex items-center justify-center gap-2 md:px-4">
              <p className="text-[15px] lg:text-[16px] font-bold text-[#001c43] tracking-tight text-center">
                {fmtDateRange(weekStart)}
              </p>
              {isCurrentWeek && (
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold text-[10px] uppercase tracking-wider shrink-0">
                  Current
                </span>
              )}
            </div>

            {/* Right spacer keeps the grid balanced; on wrap this collapses */}
            <div className="hidden md:block" aria-hidden />
          </div>
        </div>

        {/* Stats — Rooms removed; 3-col on desktop now */}
        <div className="grid grid-cols-3 gap-3 lg:gap-4">
          {[
            { label: "Total Classes", value: stats.total },
            { label: "Weekly Hours", value: stats.weekly },
            { label: "Modalities", value: stats.modalities },
          ].map((s) => (
            <div key={s.label} className="card-surface p-4">
              <p className="text-overline">{s.label}</p>
              <p className="mt-1 text-[14px] font-bold text-[#001c43] truncate">{s.value}</p>
            </div>
          ))}
        </div>

        {loading && (
          <div className="card-surface p-6">
            <div className="h-[480px] skeleton rounded-lg" />
          </div>
        )}

        {!loading && schedules.length === 0 && (
          <div className="card-surface p-12 text-center text-slate-400 text-sm">
            No schedules found for this term.
          </div>
        )}

        {!loading && schedules.length > 0 && view === "week" && (
          <WeekGrid byDay={byDay} weekStart={weekStart} onSelect={setSelected} />
        )}
        {!loading && schedules.length > 0 && view === "list" && (
          <ListView byDay={byDay} weekStart={weekStart} onSelect={setSelected} />
        )}
      </div>

      {selected && (
        <ClassDetailModal
          schedule={selected}
          weekStart={weekStart}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

// ─── MS Teams–style week grid ──────────────────────────────────────────────

function WeekGrid({
  byDay,
  weekStart,
  onSelect,
}: {
  byDay: Map<DayOfWeek, Schedule[]>;
  weekStart: Date;
  onSelect: (s: Schedule) => void;
}) {
  const today = new Date();
  return (
    <div className="card-surface overflow-hidden flex-1 flex flex-col min-h-0">
      <div className="grid grid-cols-[64px_repeat(6,1fr)] border-b border-slate-200 bg-slate-50/60">
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
                {isToday && (
                  <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-[#114b9f] align-middle" />
                )}
              </p>
            </div>
          );
        })}
      </div>

      <div className="flex-1 min-h-0 overflow-x-auto overflow-y-auto">
        <div
          className="grid grid-cols-[64px_repeat(6,minmax(140px,1fr))] relative"
          style={{ minHeight: TOTAL_HOURS * HOUR_HEIGHT }}
        >
          <div className="border-r border-slate-200 bg-slate-50/30">
            {Array.from({ length: TOTAL_HOURS }).map((_, i) => {
              const hour = START_HOUR + i;
              const am = hour < 12;
              const hh = ((hour + 11) % 12) + 1;
              return (
                <div
                  key={hour}
                  className="text-right pr-2 text-[10.5px] text-slate-400 font-medium relative"
                  style={{ height: HOUR_HEIGHT }}
                >
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
              <div
                key={d.key}
                className={`relative border-l border-slate-200 ${isToday ? "bg-blue-50/20" : ""}`}
              >
                {Array.from({ length: TOTAL_HOURS }).map((_, j) => (
                  <div
                    key={j}
                    className="border-b border-slate-100"
                    style={{ height: HOUR_HEIGHT }}
                  />
                ))}

                {isToday && <NowLine />}

                {items.map((cls) => {
                  const { top, height } = classGeometry(cls.start_time, cls.end_time);
                  const mc = MOD[cls.scheduled_modality];
                  const compact = height < 56;
                  return (
                    <button
                      key={cls.id}
                      onClick={() => onSelect(cls)}
                      className="absolute left-1.5 right-1.5 rounded-lg overflow-hidden shadow-sm border border-white/40 hover:shadow-md hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-[#114b9f] focus:ring-offset-1 transition-all cursor-pointer text-left"
                      style={{
                        top,
                        height,
                        background: mc.bg,
                        borderLeft: `4px solid ${mc.bar}`,
                      }}
                      title={`${cls.course_code} · ${cls.course_name}`}
                    >
                      <div
                        className={`px-2.5 ${compact ? "py-1" : "py-1.5"} h-full flex flex-col`}
                        style={{ color: mc.text }}
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <p className="text-[12px] font-bold truncate">{cls.course_code}</p>
                          <span
                            className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0"
                            style={{ background: mc.bar, color: "#fff" }}
                          >
                            {mc.label}
                          </span>
                        </div>
                        {!compact && (
                          <>
                            <p className="text-[10.5px] opacity-80 truncate">
                              {fmtTime(cls.start_time)} – {fmtTime(cls.end_time)}
                            </p>
                            <p className="text-[10.5px] opacity-70 truncate mt-auto">
                              {cls.room?.room_code ? `Room ${cls.room.room_code}` : "—"}
                              {cls.section ? ` · ${cls.section}` : ""}
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

      <div className="px-4 py-3 border-t border-slate-100 flex items-center gap-4 flex-wrap text-[11px] text-slate-500">
        <span className="font-bold text-slate-600 uppercase tracking-wider">Legend:</span>
        {(["f2f", "blended", "online"] as Modality[]).map((m) => (
          <span key={m} className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded" style={{ background: MOD[m].bar }} />
            {MOD[m].label}
          </span>
        ))}
        <span className="ml-auto text-slate-400">Click a class to see details</span>
      </div>
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

// ─── List view ─────────────────────────────────────────────────────────────

function ListView({
  byDay,
  weekStart,
  onSelect,
}: {
  byDay: Map<DayOfWeek, Schedule[]>;
  weekStart: Date;
  onSelect: (s: Schedule) => void;
}) {
  const today = new Date();
  return (
    <div className="space-y-4">
      {DAYS.map((d, i) => {
        const items = byDay.get(d.key) ?? [];
        if (items.length === 0) return null;
        const dayDate = addDays(weekStart, i);
        const isToday = sameDate(dayDate, today);
        return (
          <div key={d.key} className="card-surface p-5 lg:p-6">
            <div className="flex items-center gap-3 mb-4">
              <p className={`text-[12px] font-bold uppercase tracking-wider ${isToday ? "text-[#114b9f]" : "text-slate-600"}`}>
                {d.label}
                <span className="ml-2 text-[11px] font-medium text-slate-400 normal-case">
                  {dayDate.toLocaleDateString("en-PH", { month: "short", day: "numeric" })}
                </span>
                {isToday && <span className="ml-2 px-2 py-0.5 rounded-full bg-blue-100 text-[#114b9f] text-[10px]">Today</span>}
              </p>
              <div className="flex-1 h-px bg-slate-100" />
              <span className="text-[10.5px] text-slate-400">{items.length} {items.length === 1 ? "class" : "classes"}</span>
            </div>

            <div className="space-y-2.5">
              {items.map((cls) => {
                const mc = MOD[cls.scheduled_modality];
                return (
                  <button
                    key={cls.id}
                    onClick={() => onSelect(cls)}
                    className="w-full text-left flex items-center gap-4 p-4 min-h-[72px] rounded-xl bg-slate-50/50 border border-slate-100 hover:border-slate-300 hover:shadow-sm hover:-translate-y-0.5 transition-all"
                  >
                    <div className="text-center w-20 shrink-0">
                      <p className="text-[12.5px] font-bold text-[#001c43]">{fmtTime(cls.start_time)}</p>
                      <div className="my-1 h-5 w-0.5 bg-slate-200 mx-auto" />
                      <p className="text-[11px] text-slate-400">{fmtTime(cls.end_time)}</p>
                    </div>
                    <div className="w-1.5 self-stretch rounded-full shrink-0" style={{ background: mc.bar }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <p className="text-[14px] font-bold text-[#001c43]">{cls.course_code}</p>
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase"
                          style={{ background: mc.bar, color: "#fff" }}
                        >
                          {mc.label}
                        </span>
                      </div>
                      <p className="text-[12.5px] text-slate-600 truncate">{cls.course_name}</p>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400 flex-wrap">
                        <span>Room {cls.room?.room_code ?? "—"}</span>
                        <span>·</span>
                        <span>Section {cls.section ?? "—"}</span>
                        <span>·</span>
                        <span>{cls.enrolled_count} students</span>
                      </div>
                    </div>
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      className="text-slate-300 shrink-0"
                    >
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Class detail modal ────────────────────────────────────────────────────

function ClassDetailModal({
  schedule,
  weekStart,
  onClose,
}: {
  schedule: Schedule;
  weekStart: Date;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const mc = MOD[schedule.scheduled_modality];
  const dayIdx = DAYS.findIndex((d) => d.key === schedule.day_of_week);
  const date = dayIdx >= 0 ? addDays(weekStart, dayIdx) : null;
  const duration = durationHours(schedule.start_time, schedule.end_time);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 sm:p-6 fade-up"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Hero band */}
        <div
          className="px-7 py-7 sm:px-8 sm:py-8 relative"
          style={{ background: `linear-gradient(135deg, ${mc.bar} 0%, ${mc.bar}dd 100%)` }}
        >
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute top-5 right-5 w-9 h-9 rounded-lg bg-white/15 hover:bg-white/25 backdrop-blur-sm text-white flex items-center justify-center transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>

          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/15 border border-white/20 backdrop-blur-sm text-[10.5px] font-bold tracking-wider uppercase text-white mb-4 mr-12">
            {mc.label} · {schedule.section ?? "Section —"}
          </span>
          <h2 className="text-[22px] font-bold text-white leading-tight tracking-tight pr-12">
            {schedule.course_code}
          </h2>
          <p className="text-[14px] text-white/85 leading-snug mt-1 pr-2">
            {schedule.course_name}
          </p>
        </div>

        {/* Body */}
        <div className="px-7 py-7 sm:px-8 sm:py-8 space-y-6">
          <div className="grid grid-cols-2 gap-5 sm:gap-6">
            <DetailField
              label="When"
              icon={
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              }
              value={
                <>
                  {DAYS[dayIdx]?.label ?? "—"}
                  {date && (
                    <span className="block text-[11px] text-slate-500 font-medium mt-0.5">
                      {date.toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" })}
                    </span>
                  )}
                </>
              }
            />
            <DetailField
              label="Time"
              icon={
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              }
              value={
                <>
                  {fmtTime(schedule.start_time)} – {fmtTime(schedule.end_time)}
                  <span className="block text-[11px] text-slate-500 font-medium mt-0.5">
                    {duration.toFixed(1)} hours
                  </span>
                </>
              }
            />
            <DetailField
              label="Room"
              icon={
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                  <polyline points="9 22 9 12 15 12 15 22" />
                </svg>
              }
              value={
                schedule.room ? (
                  <>
                    Room {schedule.room.room_code}
                    <span className="block text-[11px] text-slate-500 font-medium mt-0.5">
                      {schedule.room.building} · Floor {schedule.room.floor_number}
                    </span>
                  </>
                ) : (
                  "—"
                )
              }
            />
            <DetailField
              label="Enrolled"
              icon={
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                </svg>
              }
              value={
                <>
                  {schedule.enrolled_count} students
                  <span className="block text-[11px] text-slate-500 font-medium mt-0.5">
                    Section {schedule.section ?? "—"}
                  </span>
                </>
              }
            />
          </div>

          <div className="pt-5 border-t border-slate-100 flex items-center justify-between gap-3 text-[11.5px] text-slate-500">
            <span className="font-medium">{schedule.academic_term}</span>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10.5px] font-bold uppercase tracking-wider shrink-0 ${
                schedule.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${schedule.is_active ? "bg-emerald-500" : "bg-slate-400"}`} />
              {schedule.is_active ? "Active" : "Inactive"}
            </span>
          </div>
        </div>

        <div className="px-7 py-5 sm:px-8 bg-slate-50/60 border-t border-slate-100 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-6 py-2.5 min-h-[44px] rounded-xl text-[13px] font-bold border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailField({
  label,
  icon,
  value,
}: {
  label: string;
  icon: React.ReactNode;
  value: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[10.5px] text-slate-400 font-bold uppercase tracking-wider mb-1.5">
        <span className="text-slate-400">{icon}</span>
        {label}
      </div>
      <p className="text-[13.5px] font-bold text-[#001c43] leading-snug">{value}</p>
    </div>
  );
}
