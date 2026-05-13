"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type DayOfWeek = "mon" | "tue" | "wed" | "thu" | "fri" | "sat";

type Schedule = {
  id: string;
  course_code: string;
  course_name: string;
  section: string | null;
  enrolled_count: number;
  scheduled_modality: "f2f" | "blended" | "online";
  day_of_week: DayOfWeek;
  start_time: string;
  end_time: string;
  academic_term: string;
  is_active: boolean;
  term_start_date: string | null;
  term_end_date: string | null;
  section_id: string | null;
  archived_at: string | null;
  archived_by: string | null;
  archive_reason: string | null;
  room: { room_code: string; building: string; floor_number: number };
  faculty: { full_name: string; email: string };
};

const DOW_INDEX: Record<DayOfWeek, number> = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

function countSessions(s: Schedule): number {
  if (!s.term_start_date || !s.term_end_date) return 0;
  const start = new Date(s.term_start_date + "T00:00:00Z");
  const end = new Date(s.term_end_date + "T00:00:00Z");
  let count = 0;
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    if (d.getUTCDay() === DOW_INDEX[s.day_of_week]) count++;
  }
  return count;
}

export default function ScheduleDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id ?? "");

  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [termStart, setTermStart] = useState("");
  const [termEnd, setTermEnd] = useState("");
  const [archiveReason, setArchiveReason] = useState("");

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/apis/schedules/${id}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as { schedule: Schedule };
      setSchedule(j.schedule);
      setTermStart(j.schedule.term_start_date ?? "");
      setTermEnd(j.schedule.term_end_date ?? "");
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function saveTerm() {
    if (!termStart || !termEnd) {
      setError("Both term dates are required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/apis/schedules/${id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ term_start_date: termStart, term_end_date: termEnd }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(j?.error?.message ?? `HTTP ${res.status}`);
      }
      setToast("Term span updated.");
      setTimeout(() => setToast(null), 2500);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function archive() {
    if (archiveReason.trim().length < 20) {
      setError("Archive reason must be at least 20 characters.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/apis/schedules/${id}/archive`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ archive_reason: archiveReason.trim() }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(j?.error?.message ?? `HTTP ${res.status}`);
      }
      router.push("/ifo/ifo-schedule");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function restore() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/apis/schedules/${id}/archive?restore=1`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ restore: true }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(j?.error?.message ?? `HTTP ${res.status}`);
      }
      setToast("Schedule restored.");
      setTimeout(() => setToast(null), 2500);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="p-6 text-sm text-slate-500">Loading…</div>;
  if (!schedule) return <div className="p-6 text-sm text-rose-600">{error ?? "Not found"}</div>;

  const isArchived = !schedule.is_active && schedule.archived_at;
  const sessionEstimate = countSessions(schedule);

  return (
    <>
      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">{schedule.course_code}</h1>
            <p className="text-sm text-slate-500">{schedule.course_name}</p>
            <div className="text-xs text-slate-400 mt-1">
              {schedule.faculty?.full_name} · {schedule.room?.room_code} ({schedule.room?.building} F
              {schedule.room?.floor_number}) · {schedule.day_of_week.toUpperCase()}{" "}
              {schedule.start_time.slice(0, 5)}–{schedule.end_time.slice(0, 5)} · {schedule.academic_term}
            </div>
          </div>
          {isArchived && (
            <span className="text-xs px-2 py-1 rounded-full bg-rose-100 text-rose-700">Archived</span>
          )}
        </header>

        {toast && (
          <div className="text-xs px-3 py-2 rounded-md bg-emerald-100 text-emerald-700 inline-block">{toast}</div>
        )}
        {error && <div className="text-xs text-rose-600">{error}</div>}

        {/* Term-span editor */}
        <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
          <h2 className="text-sm font-medium text-slate-900">Term duration</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="text-xs">
              Term start
              <input
                className="block mt-1 text-sm border border-slate-200 rounded-md px-2 py-2 w-full"
                type="date"
                value={termStart}
                onChange={(e) => setTermStart(e.target.value)}
                disabled={!!isArchived}
              />
            </label>
            <label className="text-xs">
              Term end
              <input
                className="block mt-1 text-sm border border-slate-200 rounded-md px-2 py-2 w-full"
                type="date"
                value={termEnd}
                onChange={(e) => setTermEnd(e.target.value)}
                disabled={!!isArchived}
              />
            </label>
            <div className="text-xs flex flex-col justify-end">
              <div className="text-slate-500">Estimated sessions in span:</div>
              <div className="text-sm font-medium text-slate-900">
                {sessionEstimate} session{sessionEstimate === 1 ? "" : "s"}
              </div>
            </div>
          </div>
          <div className="flex justify-end">
            <button
              onClick={saveTerm}
              disabled={busy || !!isArchived}
              className="px-3 py-1.5 rounded-md bg-slate-900 text-white text-sm font-medium disabled:opacity-50"
            >
              Save term span
            </button>
          </div>
        </section>

        {/* Move CTA */}
        {!isArchived && (
          <section className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-medium text-slate-900">Move this class</h2>
              <p className="text-xs text-slate-500">
                Change the room, day, time, or section effective on a specific date. Past sessions stay on the
                current schedule.
              </p>
            </div>
            <Link
              href={`/ifo/ifo-schedule-move/${id}`}
              className="px-3 py-1.5 rounded-md bg-slate-900 text-white text-sm font-medium"
            >
              Open move wizard
            </Link>
          </section>
        )}

        {/* Archive / Restore */}
        <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
          {isArchived ? (
            <>
              <h2 className="text-sm font-medium text-slate-900">Restore archived schedule</h2>
              <div className="text-xs text-slate-500">
                Archived on{" "}
                {schedule.archived_at ? new Date(schedule.archived_at).toLocaleString() : "—"}.
                {schedule.archive_reason && (
                  <div className="mt-2 text-slate-700 italic">"{schedule.archive_reason}"</div>
                )}
              </div>
              <div className="flex justify-end">
                <button
                  onClick={restore}
                  disabled={busy}
                  className="px-3 py-1.5 rounded-md bg-emerald-600 text-white text-sm font-medium disabled:opacity-50"
                >
                  Restore
                </button>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-sm font-medium text-slate-900">Archive (soft-remove) this schedule</h2>
              <p className="text-xs text-slate-500">
                Future <code>scheduled</code> sessions are removed; historical sessions remain intact. Reason is
                required (≥ 20 chars).
              </p>
              <textarea
                className="w-full text-sm border border-slate-200 rounded-md px-2 py-2 min-h-20"
                placeholder="Reason for archiving this class…"
                value={archiveReason}
                onChange={(e) => setArchiveReason(e.target.value)}
              />
              <div className="flex justify-between items-center">
                <div className="text-[10px] text-slate-400">{archiveReason.length} chars (min 20)</div>
                <button
                  onClick={archive}
                  disabled={busy || archiveReason.trim().length < 20}
                  className="px-3 py-1.5 rounded-md bg-rose-600 text-white text-sm font-medium disabled:opacity-50"
                >
                  Archive
                </button>
              </div>
            </>
          )}
        </section>
      </main>
    </>
  );
}
