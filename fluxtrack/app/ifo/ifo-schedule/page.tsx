"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import EmptyState from "@/components/ui/empty-state";

type DayOfWeek = "mon" | "tue" | "wed" | "thu" | "fri" | "sat";
type Modality = "f2f" | "blended" | "online";

type Schedule = {
  id: string;
  faculty_id: string;
  room_id: string;
  course_code: string;
  course_name: string;
  section: string | null;
  scheduled_modality: Modality;
  day_of_week: DayOfWeek;
  start_time: string;
  end_time: string;
  academic_term: string;
  is_active: boolean;
  archived_at: string | null;
  archive_reason: string | null;
  term_start_date: string | null;
  term_end_date: string | null;
  section_id: string | null;
  replaced_by_schedule_id: string | null;
  faculty: { full_name: string; email: string } | null;
  room: { room_code: string; building: string; floor_number: number } | null;
};

type ImportResult = { inserted: number; rejected: number; errors: { row: number; message: string }[]; total_rows: number };

const DAY_ORDER: Record<DayOfWeek, number> = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const DAY_LABEL: Record<DayOfWeek, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat" };

const MODALITY_BADGE: Record<Modality, string> = {
  f2f: "bg-emerald-100 text-emerald-700",
  blended: "bg-amber-100 text-amber-700",
  online: "bg-sky-100 text-sky-700",
};

export default function IFOSchedulePage() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"active" | "archived">("active");
  const [day, setDay] = useState<DayOfWeek | "all">("all");

  const [file, setFile] = useState<File | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importErr, setImportErr] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importPanelOpen, setImportPanelOpen] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/apis/schedules?include_archived=1", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as { schedules: Schedule[] };
      setSchedules(j.schedules ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    return schedules
      .filter((s) => (tab === "active" ? s.is_active && !s.archived_at : !!s.archived_at))
      .filter((s) => day === "all" || s.day_of_week === day)
      .filter((s) => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (
          s.course_code.toLowerCase().includes(q) ||
          s.course_name.toLowerCase().includes(q) ||
          (s.faculty?.full_name ?? "").toLowerCase().includes(q) ||
          (s.room?.room_code ?? "").toLowerCase().includes(q) ||
          (s.section ?? "").toLowerCase().includes(q)
        );
      })
      .sort(
        (a, b) =>
          DAY_ORDER[a.day_of_week] - DAY_ORDER[b.day_of_week] ||
          a.start_time.localeCompare(b.start_time)
      );
  }, [schedules, tab, day, search]);

  const activeCount = schedules.filter((s) => s.is_active && !s.archived_at).length;
  const archivedCount = schedules.filter((s) => s.archived_at).length;

  async function submitImport(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setImportBusy(true);
    setImportErr(null);
    setImportResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/apis/schedules/import", { method: "POST", body: fd });
      const data = (await res.json()) as ImportResult & { error?: { message?: string } };
      if (!res.ok) throw new Error(data?.error?.message ?? "Import failed");
      setImportResult(data);
      await refresh();
    } catch (err) {
      setImportErr(err instanceof Error ? err.message : String(err));
    } finally {
      setImportBusy(false);
    }
  }

  return (
    <>
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Schedules</h1>
            <p className="text-sm text-slate-500">
              Manage class schedules. Click a row to open the detail page (term-span editor, archive,
              move-wizard launcher).
            </p>
          </div>
          <button
            onClick={() => setImportPanelOpen((v) => !v)}
            className="px-3 py-1.5 rounded-md border border-slate-200 text-sm font-medium hover:bg-slate-50"
          >
            {importPanelOpen ? "Hide import" : "Import CSV"}
          </button>
        </header>

        {importPanelOpen && (
          <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
            <h2 className="text-sm font-medium text-slate-900">Bulk import schedules</h2>
            <form onSubmit={submitImport} className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-center">
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="text-xs"
              />
              <button
                type="submit"
                disabled={!file || importBusy}
                className="px-3 py-1.5 rounded-md bg-slate-900 text-white text-sm font-medium disabled:opacity-50"
              >
                {importBusy ? "Importing…" : "Validate & Import"}
              </button>
            </form>
            <p className="text-[10px] text-slate-500 font-mono">
              Required columns: course_code, course_name, section, enrolled_count,
              scheduled_modality, day_of_week, start_time, end_time, academic_term, faculty_email,
              room_code
            </p>
            {importErr && <div className="text-xs text-rose-600">{importErr}</div>}
            {importResult && (
              <div className="grid grid-cols-3 gap-2 text-xs">
                <Pill label="Total" value={importResult.total_rows} />
                <Pill label="Inserted" value={importResult.inserted} color="text-emerald-700" />
                <Pill
                  label="Rejected"
                  value={importResult.rejected}
                  color={importResult.rejected > 0 ? "text-rose-700" : "text-slate-600"}
                />
                {importResult.errors.length > 0 && (
                  <details className="col-span-3 bg-rose-50 border border-rose-200 rounded-md p-2">
                    <summary className="text-xs font-medium text-rose-700 cursor-pointer">
                      {importResult.errors.length} row error(s)
                    </summary>
                    <ul className="mt-1 text-[10px] text-rose-700 font-mono space-y-0.5">
                      {importResult.errors.slice(0, 50).map((e) => (
                        <li key={e.row}>L{e.row}: {e.message}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}
          </section>
        )}

        <section className="flex items-center gap-3 flex-wrap">
          <div className="flex gap-1 bg-slate-100 rounded-md p-1 text-xs">
            <button
              onClick={() => setTab("active")}
              className={`px-3 py-1 rounded ${tab === "active" ? "bg-white shadow-sm" : "text-slate-500"}`}
            >
              Active ({activeCount})
            </button>
            <button
              onClick={() => setTab("archived")}
              className={`px-3 py-1 rounded ${tab === "archived" ? "bg-white shadow-sm" : "text-slate-500"}`}
            >
              Archived ({archivedCount})
            </button>
          </div>
          <select
            className="text-sm border border-slate-200 rounded-md px-2 py-1 bg-white"
            value={day}
            onChange={(e) => setDay(e.target.value as DayOfWeek | "all")}
          >
            <option value="all">All days</option>
            {(["mon", "tue", "wed", "thu", "fri", "sat"] as DayOfWeek[]).map((d) => (
              <option key={d} value={d}>
                {DAY_LABEL[d]}
              </option>
            ))}
          </select>
          <input
            className="flex-1 min-w-48 text-sm border border-slate-200 rounded-md px-2 py-1"
            placeholder="Search course / faculty / room / section…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </section>

        {error && <div className="text-xs text-rose-600">{error}</div>}

        {loading ? (
          <div className="text-sm text-slate-500">Loading…</div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title={tab === "archived" ? "No archived schedules" : "No schedules match the current filters"}
            description={
              tab === "active"
                ? 'Use "Import CSV" or apply the seed to add schedules.'
                : "Archived schedules will appear here when you soft-remove a class."
            }
          />
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-2">Course</th>
                  <th className="text-left px-4 py-2">Faculty</th>
                  <th className="text-left px-4 py-2">Section</th>
                  <th className="text-left px-4 py-2">Day · Time</th>
                  <th className="text-left px-4 py-2">Room</th>
                  <th className="text-left px-4 py-2">Modality</th>
                  <th className="text-left px-4 py-2">Term</th>
                  <th className="text-right px-4 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-2">
                      <Link
                        href={`/ifo/ifo-schedule/${s.id}`}
                        className="font-medium text-slate-900 hover:underline"
                      >
                        {s.course_code}
                      </Link>
                      <div className="text-xs text-slate-500 truncate max-w-xs">{s.course_name}</div>
                    </td>
                    <td className="px-4 py-2 text-slate-700">{s.faculty?.full_name ?? "—"}</td>
                    <td className="px-4 py-2 text-slate-700">{s.section ?? "—"}</td>
                    <td className="px-4 py-2 text-slate-700">
                      <span className="font-mono">{DAY_LABEL[s.day_of_week]}</span>{" "}
                      <span className="text-slate-500">
                        {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-slate-700">
                      {s.room?.room_code ?? "—"}
                      {s.room && (
                        <span className="text-xs text-slate-400"> ({s.room.building} F{s.room.floor_number})</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${MODALITY_BADGE[s.scheduled_modality]}`}>
                        {s.scheduled_modality}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-500">
                      {s.term_start_date && s.term_end_date
                        ? `${s.term_start_date} → ${s.term_end_date}`
                        : s.academic_term}
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <Link
                        href={`/ifo/ifo-schedule/${s.id}`}
                        className="text-xs px-2 py-1 rounded-md border border-slate-200 hover:bg-slate-50 mr-1"
                      >
                        Detail
                      </Link>
                      {!s.archived_at && (
                        <Link
                          href={`/ifo/ifo-schedule-move/${s.id}`}
                          className="text-xs px-2 py-1 rounded-md bg-slate-900 text-white hover:bg-slate-800"
                        >
                          Move
                        </Link>
                      )}
                      {s.archived_at && (
                        <span className="text-xs text-rose-600">Archived</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </>
  );
}

function Pill({ label, value, color = "text-slate-700" }: { label: string; value: number; color?: string }) {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-md p-2 text-center">
      <div className={`text-base font-semibold ${color}`}>{value}</div>
      <div className="text-[10px] text-slate-500 uppercase tracking-wide">{label}</div>
    </div>
  );
}
