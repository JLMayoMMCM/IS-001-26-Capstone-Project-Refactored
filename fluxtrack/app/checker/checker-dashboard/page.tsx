"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import EmptyState from "@/components/ui/empty-state";

type Shift = {
  id: string;
  user_id: string;
  shift_date: string;
  scheduled_start: string;
  scheduled_end: string;
  actual_start: string | null;
  actual_end: string | null;
  rooms_validated: number;
  rooms_skipped: number;
  note: string | null;
  floors?: { floor_number: number; building: string | null }[];
};

type ValidationRow = {
  id: string;
  action: "verified" | "flagged_absent" | "could_not_access";
  cna_reason: string | null;
  validated_at: string;
  session_id: string;
};

const ACTION_LABEL: Record<ValidationRow["action"], { label: string; color: string }> = {
  verified:           { label: "Verified",        color: "bg-emerald-100 text-emerald-700" },
  flagged_absent:     { label: "Flagged absent",  color: "bg-rose-100 text-rose-700" },
  could_not_access:   { label: "Could not access", color: "bg-amber-100 text-amber-700" },
};

function durationLabel(start: string | null, end: string | null): string {
  if (!start) return "—";
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  const mins = Math.max(0, Math.round((e - s) / 60_000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

export default function CheckerDashboard() {
  const [shift, setShift] = useState<Shift | null>(null);
  const [validations, setValidations] = useState<ValidationRow[]>([]);
  const [history, setHistory] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [shRes, vRes] = await Promise.all([
        fetch("/apis/checker/shifts?scope=mine", { cache: "no-store" }),
        fetch("/apis/checker/validations?scope=mine&limit=200", { cache: "no-store" }),
      ]);
      if (!shRes.ok) throw new Error(`shifts: HTTP ${shRes.status}`);
      const shJson = (await shRes.json()) as { shifts: Shift[] };
      const today = new Date().toISOString().slice(0, 10);
      const todays = shJson.shifts.find((s) => s.shift_date === today) ?? null;
      const past = shJson.shifts
        .filter((s) => s.shift_date !== today)
        .sort((a, b) => (a.shift_date < b.shift_date ? 1 : -1))
        .slice(0, 7);
      setShift(todays);
      setHistory(past);
      if (vRes.ok) {
        const vJson = (await vRes.json()) as { validations: ValidationRow[] };
        setValidations(vJson.validations ?? []);
      }
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

  async function startShift() {
    if (!shift) return;
    await fetch(`/apis/checker/shifts/${shift.id}/start`, { method: "POST" });
    await refresh();
  }

  async function endShift() {
    if (!shift) return;
    if (!confirm("End your shift? You cannot add more validations after this.")) return;
    await fetch(`/apis/checker/shifts/${shift.id}/end`, { method: "POST" });
    await refresh();
  }

  async function copyShift() {
    const target = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    if (!confirm(`Copy this shift assignment to ${target}?`)) return;
    const res = await fetch("/apis/checker/shifts/copy", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ target_date: target }),
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      alert(j?.error?.message ?? `Copy failed: HTTP ${res.status}`);
      return;
    }
    alert(`Copied to ${target}.`);
  }

  const today = new Date().toISOString().slice(0, 10);
  const todaysValidations = validations.filter((v) => v.validated_at.slice(0, 10) === today);
  const verifiedToday = todaysValidations.filter((v) => v.action === "verified").length;
  const flaggedToday = todaysValidations.filter((v) => v.action === "flagged_absent").length;
  const cnaToday = todaysValidations.filter((v) => v.action === "could_not_access").length;
  const cnaBreakdown: Record<string, number> = {};
  for (const v of todaysValidations) {
    if (v.action === "could_not_access" && v.cna_reason) {
      cnaBreakdown[v.cna_reason] = (cnaBreakdown[v.cna_reason] ?? 0) + 1;
    }
  }

  return (
    <>
      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Checker Dashboard</h1>
            <p className="text-sm text-slate-500">
              Today&apos;s KPIs, your shift, and recent history. Walk the checklist from the top-bar.
            </p>
          </div>
          <Link
            href="/checker/checker-checklist"
            className="px-3 py-1.5 rounded-md bg-slate-900 text-white text-sm font-medium hover:bg-slate-800"
          >
            Open checklist →
          </Link>
        </header>

        {error && <div className="text-xs text-rose-600">{error}</div>}

        {loading ? (
          <div className="text-sm text-slate-500">Loading…</div>
        ) : (
          <>
            {/* KPI tiles */}
            <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Kpi label="Verified today"   value={verifiedToday} accent="#10b981" />
              <Kpi label="Flagged absent"   value={flaggedToday}  accent="#ef4444" />
              <Kpi label="Could not access" value={cnaToday}      accent="#f59e0b" />
              <Kpi label="Total today"      value={todaysValidations.length} accent="#0891b2" />
            </section>

            {/* Today's shift */}
            <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium text-slate-900">Today&apos;s shift</h2>
                {shift?.actual_end && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">Ended</span>
                )}
                {shift?.actual_start && !shift?.actual_end && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">In progress</span>
                )}
                {shift && !shift.actual_start && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Not started</span>
                )}
              </div>
              {!shift ? (
                <EmptyState
                  title="No shift assigned today"
                  description="An IFO admin needs to assign you a shift and floors before you can validate sessions."
                />
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <Detail label="Date" value={shift.shift_date} />
                    <Detail label="Scheduled" value={`${shift.scheduled_start.slice(0,5)} – ${shift.scheduled_end.slice(0,5)}`} />
                    <Detail label="Started" value={shift.actual_start ? new Date(shift.actual_start).toLocaleTimeString() : "—"} />
                    <Detail label="Duration" value={durationLabel(shift.actual_start, shift.actual_end)} />
                  </div>
                  {shift.floors && shift.floors.length > 0 && (
                    <div className="text-xs">
                      <div className="text-slate-500 mb-1">Floors</div>
                      <div className="flex gap-1 flex-wrap">
                        {shift.floors.map((f, i) => (
                          <span key={i} className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                            {f.building ? `${f.building} ` : ""}F{f.floor_number}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2 pt-2">
                    {!shift.actual_start && (
                      <button onClick={startShift} className="px-3 py-1.5 rounded-md bg-slate-900 text-white text-sm font-medium">
                        Start shift
                      </button>
                    )}
                    {shift.actual_start && !shift.actual_end && (
                      <button onClick={endShift} className="px-3 py-1.5 rounded-md bg-rose-600 text-white text-sm font-medium">
                        End shift
                      </button>
                    )}
                    <button onClick={copyShift} className="px-3 py-1.5 rounded-md border border-slate-200 text-sm">
                      Copy to tomorrow
                    </button>
                  </div>
                </>
              )}
            </section>

            {/* CNA breakdown */}
            {cnaToday > 0 && (
              <section className="bg-white border border-slate-200 rounded-xl p-4">
                <h2 className="text-sm font-medium text-slate-900 mb-2">Could-not-access reasons (today)</h2>
                <ul className="text-xs text-slate-700 space-y-1">
                  {Object.entries(cnaBreakdown).map(([reason, count]) => (
                    <li key={reason} className="flex items-center justify-between">
                      <span>{reason.replace(/_/g, " ")}</span>
                      <span className="font-semibold">{count}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Recent history */}
            <section>
              <h2 className="text-sm font-medium text-slate-900 mb-2">Recent shifts</h2>
              {history.length === 0 ? (
                <div className="text-xs text-slate-500">No prior shifts to show.</div>
              ) : (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
                      <tr>
                        <th className="text-left px-4 py-2">Date</th>
                        <th className="text-left px-4 py-2">Scheduled</th>
                        <th className="text-left px-4 py-2">Verified</th>
                        <th className="text-left px-4 py-2">Skipped</th>
                        <th className="text-left px-4 py-2">Duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((h) => (
                        <tr key={h.id} className="border-t border-slate-100">
                          <td className="px-4 py-2 font-medium text-slate-900">{h.shift_date}</td>
                          <td className="px-4 py-2 text-slate-500">
                            {h.scheduled_start.slice(0,5)}&ndash;{h.scheduled_end.slice(0,5)}
                          </td>
                          <td className="px-4 py-2 text-slate-700">{h.rooms_validated}</td>
                          <td className="px-4 py-2 text-slate-700">{h.rooms_skipped}</td>
                          <td className="px-4 py-2 text-slate-500">{durationLabel(h.actual_start, h.actual_end)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </>
  );
}

function Kpi({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold" style={{ color: accent }}>
        {value}
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-slate-500">{label}</div>
      <div className="text-sm font-medium text-slate-900">{value}</div>
    </div>
  );
}
