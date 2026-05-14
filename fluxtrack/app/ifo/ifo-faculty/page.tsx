"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import EmptyState from "@/components/ui/empty-state";

type FacultyUser = {
  id: string;
  full_name: string;
  email: string;
  faculty_id: string | null;
  department: string | null;
  employment_type: "full_time" | "part_time" | null;
  is_active: boolean;
};

type Schedule = {
  id: string;
  course_code: string;
  course_name: string;
  section: string | null;
  enrolled_count: number;
  scheduled_modality: "f2f" | "blended" | "online";
  day_of_week: "mon" | "tue" | "wed" | "thu" | "fri" | "sat";
  start_time: string;
  end_time: string;
  faculty_id: string;
  is_active: boolean;
  room: { room_code: string } | null;
};

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function hoursBetween(start: string, end: string): number {
  return (timeToMinutes(end) - timeToMinutes(start)) / 60;
}
function initials(name: string): string {
  return name.split(" ").map((p) => p[0] ?? "").slice(0, 2).join("").toUpperCase();
}

export default function FacultyIndexPage() {
  const [faculty, setFaculty] = useState<FacultyUser[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dept, setDept] = useState<string>("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, schedRes] = await Promise.all([
        fetch("/apis/users?role=faculty&active=true", { cache: "no-store" }),
        fetch("/apis/schedules", { cache: "no-store" }),
      ]);
      const usersJson = await usersRes.json().catch(() => ({ users: [] }));
      const schedJson = await schedRes.json().catch(() => ({ schedules: [] }));
      setFaculty((usersJson?.users ?? []) as FacultyUser[]);
      setSchedules((schedJson?.schedules ?? []) as Schedule[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const departments = useMemo(() => {
    const set = new Set<string>();
    faculty.forEach((f) => f.department && set.add(f.department));
    return Array.from(set).sort();
  }, [faculty]);

  const byFaculty = useMemo(() => {
    const map = new Map<string, Schedule[]>();
    schedules.filter((s) => s.is_active).forEach((s) => {
      const list = map.get(s.faculty_id) ?? [];
      list.push(s);
      map.set(s.faculty_id, list);
    });
    return map;
  }, [schedules]);

  const filtered = useMemo(() => {
    let list = faculty;
    if (dept !== "all") list = list.filter((f) => f.department === dept);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (f) =>
          f.full_name.toLowerCase().includes(q) ||
          f.email.toLowerCase().includes(q) ||
          (f.faculty_id ?? "").toLowerCase().includes(q) ||
          (f.department ?? "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [faculty, search, dept]);

  return (
    <div className="flex-1 flex flex-col fade-up min-h-0">
      <div className="px-4 sm:px-6 lg:px-8 pb-6 lg:pb-8 space-y-4 flex-1 flex flex-col min-h-0">
        <div className="card-surface card-primary p-5 lg:p-6">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="w-12 h-12 rounded-xl bg-blue-50 text-[#114b9f] flex items-center justify-center shrink-0">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </span>
            <div className="flex-1 min-w-0">
              <h1 className="text-headline text-[#001c43]">Faculty &amp; Classes</h1>
              <p className="text-[12.5px] text-slate-500 mt-0.5">
                {faculty.length} active faculty · {schedules.filter((s) => s.is_active).length} active classes this term
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <select
              value={dept}
              onChange={(e) => setDept(e.target.value)}
              className="text-[12.5px] border border-slate-200 rounded-xl px-3 py-2 bg-white"
            >
              <option value="all">All departments</option>
              {departments.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, faculty ID, department…"
              className="flex-1 min-w-[200px] text-[13px] border border-slate-200 rounded-xl px-3 py-2 bg-white"
            />
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="card-surface p-5"><div className="h-24 skeleton rounded-lg" /></div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState title="No faculty match" body="Try clearing filters or check the active term." />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {filtered.map((f) => {
              const list = byFaculty.get(f.id) ?? [];
              const sectionSet = new Set(list.map((s) => s.section).filter(Boolean) as string[]);
              const hours = list.reduce((sum, s) => sum + hoursBetween(s.start_time, s.end_time), 0);
              const modSet = new Set(list.map((s) => s.scheduled_modality));
              return (
                <Link
                  key={f.id}
                  href={`/ifo/ifo-faculty/${f.id}`}
                  className="card-surface lift p-5 flex flex-col gap-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-lg bg-blue-100 text-blue-700 font-bold text-[13px] flex items-center justify-center shrink-0">
                      {initials(f.full_name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-bold text-[#001c43] truncate">{f.full_name}</p>
                      <p className="text-[11px] text-slate-500 truncate">{f.email}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <Stat label="Classes" value={String(list.length)} />
                    <Stat label="Weekly" value={`${hours.toFixed(1)}h`} />
                    <Stat label="Sections" value={String(sectionSet.size)} />
                  </div>

                  <div className="flex items-center justify-between text-[11px] flex-wrap gap-2">
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-bold">
                      {f.department ?? "—"}
                    </span>
                    {f.employment_type && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
                        style={{
                          background: f.employment_type === "full_time" ? "#dcfce7" : "#fef3c7",
                          color: f.employment_type === "full_time" ? "#166534" : "#92400e",
                        }}
                      >
                        {f.employment_type === "full_time" ? "Full-time" : "Part-time"}
                      </span>
                    )}
                    {Array.from(modSet).map((m) => (
                      <span key={m} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-50 text-slate-500 uppercase tracking-wider">
                        {m === "f2f" ? "F2F" : m === "blended" ? "Hybrid" : "Online"}
                      </span>
                    ))}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 rounded-lg p-2">
      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
      <p className="text-[14px] font-bold text-[#001c43] mt-0.5">{value}</p>
    </div>
  );
}
