"use client";

import { useEffect, useState, useCallback } from "react";

type HrRecord = {
  id: string;
  session_date: string;
  status: string;
  actual_modality: string | null;
  duration_minutes: number | null;
  faculty_name: string;
  faculty_department: string | null;
  course_code: string;
  room_code: string;
  scheduled_modality: string;
  modality_override: boolean;
  lock_stage: string | null;
  payroll_period_name: string | null;
  scheduled_start: string;
  actual_start: string | null;
  actual_end: string | null;
};

const sb: globalThis.Record<string, string> = {
  completed: "bg-green-100 text-green-700",
  early_end: "bg-orange-100 text-orange-800",
  absent: "bg-red-100 text-red-700",
  checker_flagged: "bg-red-200 text-red-900",
  overstay: "bg-red-200 text-red-900",
  active: "bg-green-100 text-green-800",
  pending: "bg-yellow-100 text-yellow-800",
  scheduled: "bg-slate-100 text-slate-600",
  en_route: "bg-orange-100 text-orange-800",
};

const STATUSES = ["all", "completed", "early_end", "absent", "checker_flagged", "overstay"];

type Filters = { date_from: string; date_to: string; status: string; q: string };

export default function HRRecordsPage() {
  const [records, setRecords] = useState<HrRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>({
    date_from: defaultStart(),
    date_to:   today(),
    status:    "all",
    q:         "",
  });

  const refresh = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      date_from: filters.date_from,
      date_to:   filters.date_to,
      ...(filters.status !== "all" ? { status: filters.status } : {}),
      ...(filters.q ? { q: filters.q } : {}),
      limit: "100",
    });
    const res = await fetch(`/apis/hr/records?${params}`, { cache: "no-store" });
    const data = await res.json();
    setRecords(data?.records ?? []);
    setTotal(data?.total ?? 0);
    setLoading(false);
  }, [filters]);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <div className="min-h-full p-8">
      <header className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Attendance Records</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {loading ? "Loading…" : `${total.toLocaleString()} records · ${records.length} visible`}
          </p>
        </div>
        <a
          href="/hr-exports"
          className="px-4 py-2.5 rounded-xl text-sm font-bold text-white shadow-sm"
          style={{ background: "#16a34a" }}
        >
          Export & Lock →
        </a>
      </header>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 lg:p-6 shadow-sm mb-5 grid grid-cols-12 gap-3">
        <div className="col-span-3">
          <label className="text-xs text-slate-500 font-semibold">From</label>
          <input
            type="date"
            value={filters.date_from}
            onChange={(e) => setFilters((f) => ({ ...f, date_from: e.target.value }))}
            className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-200 text-sm"
          />
        </div>
        <div className="col-span-3">
          <label className="text-xs text-slate-500 font-semibold">To</label>
          <input
            type="date"
            value={filters.date_to}
            onChange={(e) => setFilters((f) => ({ ...f, date_to: e.target.value }))}
            className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-200 text-sm"
          />
        </div>
        <div className="col-span-4">
          <label className="text-xs text-slate-500 font-semibold">Search faculty</label>
          <input
            value={filters.q}
            onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
            placeholder="Name or email…"
            className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-200 text-sm"
          />
        </div>
        <div className="col-span-2 flex items-end">
          <button
            onClick={refresh}
            className="w-full py-2 rounded-lg text-sm font-bold text-white"
            style={{ background: "#16a34a" }}
          >
            Apply
          </button>
        </div>
        <div className="col-span-12 flex gap-2 flex-wrap">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setFilters((f) => ({ ...f, status: s }))}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                filters.status === s
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
              }`}
            >
              {s.replace("_", " ")}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-3">
            <div className="h-8 skeleton" />
            <div className="h-8 skeleton" />
            <div className="h-8 skeleton" />
          </div>
        ) : records.length === 0 ? (
          <p className="p-12 text-center text-sm text-slate-400">No records match these filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {["Date", "Faculty", "Dept", "Course", "Room", "Sched", "Actual", "Duration", "Status", "Lock"].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-left font-bold text-xs text-slate-600 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{r.session_date}</td>
                    <td className="px-3 py-2 text-slate-900 font-medium whitespace-nowrap">{r.faculty_name}</td>
                    <td className="px-3 py-2 text-slate-500 text-xs whitespace-nowrap">{r.faculty_department ?? "—"}</td>
                    <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{r.course_code}</td>
                    <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{r.room_code}</td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded ${badgeForMod(r.scheduled_modality)}`}>
                        {r.scheduled_modality}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap">
                      {r.actual_modality ? (
                        <span className={`px-2 py-0.5 rounded ${badgeForMod(r.actual_modality)} ${r.modality_override ? "ring-2 ring-amber-300" : ""}`}>
                          {r.actual_modality}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-700 whitespace-nowrap">
                      {r.duration_minutes != null ? `${Math.floor(r.duration_minutes / 60)}h ${r.duration_minutes % 60}m` : "—"}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${sb[r.status] ?? "bg-slate-100 text-slate-600"}`}>
                        {r.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {r.lock_stage ? (
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                          r.lock_stage === "hard" ? "bg-red-100 text-red-700"
                          : r.lock_stage === "soft" ? "bg-amber-100 text-amber-700"
                          : r.lock_stage === "archived" ? "bg-slate-200 text-slate-700"
                          : "bg-slate-100 text-slate-500"
                        }`}>
                          {r.lock_stage}
                        </span>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function today() { return new Date().toISOString().slice(0, 10); }
function defaultStart() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}
function badgeForMod(m: string): string {
  if (m === "f2f")     return "bg-blue-100 text-blue-700";
  if (m === "blended") return "bg-violet-100 text-violet-700";
  if (m === "online")  return "bg-cyan-100 text-cyan-700";
  return "bg-slate-100 text-slate-600";
}
