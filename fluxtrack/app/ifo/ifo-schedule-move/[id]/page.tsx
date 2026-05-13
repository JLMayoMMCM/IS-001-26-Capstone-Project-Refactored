"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type DayOfWeek = "mon" | "tue" | "wed" | "thu" | "fri" | "sat";

type Schedule = {
  id: string;
  course_code: string;
  course_name: string;
  faculty_id: string;
  room_id: string;
  day_of_week: DayOfWeek;
  start_time: string;
  end_time: string;
  section_id: string | null;
  term_start_date: string | null;
  term_end_date: string | null;
  archived_at: string | null;
  is_active: boolean;
};

type Room = { id: string; room_code: string; building: string; floor_number: number };
type Section = { id: string; section_code: string };

type DryRun = {
  ok: boolean;
  diff?: Record<string, [unknown, unknown] | undefined>;
  conflicts?: { room: unknown[]; section: unknown[] };
};

const DAYS: DayOfWeek[] = ["mon", "tue", "wed", "thu", "fri", "sat"];

const STEPS = ["When", "What", "Conflicts", "Confirm"] as const;

export default function MoveSchedulePage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id ?? "");

  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    effective_from: "",
    room_id: "",
    day_of_week: "" as DayOfWeek | "",
    start_time: "",
    end_time: "",
    section_id: "",
  });
  const [dry, setDry] = useState<DryRun | null>(null);
  const [committing, setCommitting] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [sRes, rRes, secRes] = await Promise.all([
        fetch(`/apis/schedules/${id}`, { cache: "no-store" }),
        fetch("/apis/rooms", { cache: "no-store" }),
        fetch("/apis/sections?active=0", { cache: "no-store" }),
      ]);
      if (!sRes.ok) throw new Error(`schedule HTTP ${sRes.status}`);
      const s = (await sRes.json()) as { schedule: Schedule } | Schedule;
      const sched = "schedule" in s ? s.schedule : (s as Schedule);
      setSchedule(sched);
      if (rRes.ok) {
        const r = (await rRes.json()) as { rooms: Room[] };
        setRooms(r.rooms);
      }
      if (secRes.ok) {
        const sec = (await secRes.json()) as { sections: Section[] };
        setSections(sec.sections);
      }
      setForm((f) => ({
        ...f,
        room_id: sched.room_id,
        day_of_week: sched.day_of_week,
        start_time: sched.start_time.slice(0, 5),
        end_time: sched.end_time.slice(0, 5),
        section_id: sched.section_id ?? "",
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function runDryRun() {
    setError(null);
    setDry(null);
    if (!form.effective_from) {
      setError("Pick an effective-from date.");
      return;
    }
    const body: Record<string, unknown> = { effective_from: form.effective_from, dry_run: true };
    if (form.room_id && form.room_id !== schedule?.room_id) body.room_id = form.room_id;
    if (form.day_of_week && form.day_of_week !== schedule?.day_of_week) body.day_of_week = form.day_of_week;
    if (form.start_time && form.start_time !== schedule?.start_time.slice(0, 5))
      body.start_time = form.start_time;
    if (form.end_time && form.end_time !== schedule?.end_time.slice(0, 5)) body.end_time = form.end_time;
    if (form.section_id && form.section_id !== (schedule?.section_id ?? "")) body.section_id = form.section_id;
    try {
      const res = await fetch(`/apis/schedules/${id}/move`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await res.json()) as DryRun & { error?: { message?: string; details?: unknown } };
      if (!res.ok) {
        setDry({
          ok: false,
          conflicts: (j.error?.details as { room_conflicts?: unknown[]; section_conflicts?: unknown[] }) && {
            room: (j.error?.details as { room_conflicts?: unknown[] }).room_conflicts ?? [],
            section: (j.error?.details as { section_conflicts?: unknown[] }).section_conflicts ?? [],
          },
        });
        setError(j.error?.message ?? `HTTP ${res.status}`);
      } else {
        setDry(j);
      }
      setStep(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function commit() {
    setCommitting(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { effective_from: form.effective_from };
      if (form.room_id && form.room_id !== schedule?.room_id) body.room_id = form.room_id;
      if (form.day_of_week && form.day_of_week !== schedule?.day_of_week) body.day_of_week = form.day_of_week;
      if (form.start_time && form.start_time !== schedule?.start_time.slice(0, 5))
        body.start_time = form.start_time;
      if (form.end_time && form.end_time !== schedule?.end_time.slice(0, 5)) body.end_time = form.end_time;
      if (form.section_id && form.section_id !== (schedule?.section_id ?? "")) body.section_id = form.section_id;

      const res = await fetch(`/apis/schedules/${id}/move`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(j?.error?.message ?? `HTTP ${res.status}`);
      }
      router.push("/ifo/ifo-schedule");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCommitting(false);
    }
  }

  if (loading) return <div className="p-6 text-sm text-slate-500">Loading…</div>;
  if (!schedule) return <div className="p-6 text-sm text-rose-600">{error ?? "Schedule not found"}</div>;
  if (schedule.archived_at) {
    return (
      <div className="p-6 text-sm text-rose-600">
        This schedule is archived and cannot be moved. Restore it first.
      </div>
    );
  }

  return (
    <>
      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <header>
          <h1 className="text-2xl font-semibold text-slate-900">
            Move class — {schedule.course_code}
          </h1>
          <p className="text-sm text-slate-500">{schedule.course_name}</p>
          <p className="text-xs text-slate-400 mt-1">
            Current: {schedule.day_of_week.toUpperCase()} {schedule.start_time.slice(0, 5)}–
            {schedule.end_time.slice(0, 5)} · Room {schedule.room_id.slice(0, 8)}
          </p>
        </header>

        {/* Step indicator */}
        <div className="flex items-center gap-2 text-xs">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <span
                className={`px-2 py-0.5 rounded-full ${
                  i === step
                    ? "bg-slate-900 text-white"
                    : i < step
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-slate-100 text-slate-500"
                }`}
              >
                {i + 1}. {label}
              </span>
              {i < STEPS.length - 1 && <span className="text-slate-300">›</span>}
            </div>
          ))}
        </div>

        {error && <div className="text-xs text-rose-600">{error}</div>}

        {/* Step 0: When */}
        {step === 0 && (
          <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
            <h2 className="text-sm font-medium">When does the move take effect?</h2>
            <input
              className="text-sm border border-slate-200 rounded-md px-2 py-2 w-56"
              type="date"
              value={form.effective_from}
              min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)}
              onChange={(e) => setForm({ ...form, effective_from: e.target.value })}
            />
            <p className="text-xs text-slate-500">
              On this date, future <code>scheduled</code> sessions will re-point to the new schedule. Past sessions
              are untouched.
            </p>
            <div className="flex justify-end">
              <button
                disabled={!form.effective_from}
                onClick={() => setStep(1)}
                className="px-3 py-1.5 rounded-md bg-slate-900 text-white text-sm disabled:opacity-50"
              >
                Next: what changes
              </button>
            </div>
          </section>
        )}

        {/* Step 1: What */}
        {step === 1 && (
          <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
            <h2 className="text-sm font-medium">What changes?</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-xs">
                Room
                <select
                  className="block mt-1 text-sm border border-slate-200 rounded-md px-2 py-2 w-full"
                  value={form.room_id}
                  onChange={(e) => setForm({ ...form, room_id: e.target.value })}
                >
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.room_code} · {r.building} F{r.floor_number}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs">
                Day
                <select
                  className="block mt-1 text-sm border border-slate-200 rounded-md px-2 py-2 w-full"
                  value={form.day_of_week}
                  onChange={(e) => setForm({ ...form, day_of_week: e.target.value as DayOfWeek })}
                >
                  {DAYS.map((d) => (
                    <option key={d} value={d}>
                      {d.toUpperCase()}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs">
                Start
                <input
                  className="block mt-1 text-sm border border-slate-200 rounded-md px-2 py-2 w-full"
                  type="time"
                  value={form.start_time}
                  onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                />
              </label>
              <label className="text-xs">
                End
                <input
                  className="block mt-1 text-sm border border-slate-200 rounded-md px-2 py-2 w-full"
                  type="time"
                  value={form.end_time}
                  onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                />
              </label>
              <label className="text-xs col-span-2">
                Section
                <select
                  className="block mt-1 text-sm border border-slate-200 rounded-md px-2 py-2 w-full"
                  value={form.section_id}
                  onChange={(e) => setForm({ ...form, section_id: e.target.value })}
                >
                  <option value="">— unchanged —</option>
                  {sections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.section_code}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex justify-between">
              <button onClick={() => setStep(0)} className="text-xs px-3 py-1.5 border rounded-md">
                Back
              </button>
              <button
                onClick={runDryRun}
                className="px-3 py-1.5 rounded-md bg-slate-900 text-white text-sm"
              >
                Check conflicts
              </button>
            </div>
          </section>
        )}

        {/* Step 2: Conflicts */}
        {step === 2 && (
          <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
            <h2 className="text-sm font-medium">Conflict report</h2>
            {dry?.ok ? (
              <div className="text-xs px-3 py-2 rounded-md bg-emerald-50 text-emerald-700">
                No conflicts. The move is safe to commit.
              </div>
            ) : (
              <div className="text-xs px-3 py-2 rounded-md bg-rose-50 text-rose-700 space-y-2">
                <div>Move would create conflicts:</div>
                {dry?.conflicts?.room && dry.conflicts.room.length > 0 && (
                  <div>
                    <div className="font-medium">Room conflicts:</div>
                    <pre className="text-[10px] whitespace-pre-wrap">
                      {JSON.stringify(dry.conflicts.room, null, 2)}
                    </pre>
                  </div>
                )}
                {dry?.conflicts?.section && dry.conflicts.section.length > 0 && (
                  <div>
                    <div className="font-medium">Section conflicts:</div>
                    <pre className="text-[10px] whitespace-pre-wrap">
                      {JSON.stringify(dry.conflicts.section, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
            <div className="flex justify-between">
              <button onClick={() => setStep(1)} className="text-xs px-3 py-1.5 border rounded-md">
                Back
              </button>
              <button
                disabled={!dry?.ok}
                onClick={() => setStep(3)}
                className="px-3 py-1.5 rounded-md bg-slate-900 text-white text-sm disabled:opacity-50"
              >
                Next: confirm
              </button>
            </div>
          </section>
        )}

        {/* Step 3: Confirm */}
        {step === 3 && (
          <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
            <h2 className="text-sm font-medium">Ready to commit</h2>
            <ul className="text-xs text-slate-700 space-y-1">
              <li>
                <b>Effective from:</b> {form.effective_from}
              </li>
              <li>
                <b>Room:</b> {form.room_id}
              </li>
              <li>
                <b>Day:</b> {form.day_of_week.toUpperCase()}
              </li>
              <li>
                <b>Time:</b> {form.start_time}–{form.end_time}
              </li>
              {form.section_id && (
                <li>
                  <b>Section:</b> {form.section_id}
                </li>
              )}
            </ul>
            <p className="text-xs text-slate-500">
              The assigned faculty will be notified. Past sessions stay on the original schedule; future
              `scheduled` sessions re-point to the new one.
            </p>
            <div className="flex justify-between">
              <button onClick={() => setStep(2)} className="text-xs px-3 py-1.5 border rounded-md">
                Back
              </button>
              <button
                onClick={commit}
                disabled={committing}
                className="px-3 py-1.5 rounded-md bg-rose-600 text-white text-sm disabled:opacity-50"
              >
                {committing ? "Committing…" : "Commit move"}
              </button>
            </div>
          </section>
        )}
      </main>
    </>
  );
}
