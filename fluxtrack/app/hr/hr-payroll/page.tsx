"use client";

import { useEffect, useState } from "react";

type Period = {
  id: string;
  name: string;
  date_from: string;
  date_to: string;
  lock_stage: "none" | "soft" | "hard" | "archived";
  soft_locked_at: string | null;
  soft_lock_expires_at: string | null;
  hard_locked_at: string | null;
  archived_at: string | null;
  record_count: number;
  open_disputes_count: number;
};

const STAGE_BADGE: Record<Period["lock_stage"], string> = {
  none:     "bg-slate-100 text-slate-600",
  soft:     "bg-amber-100 text-amber-800",
  hard:     "bg-red-100 text-red-800",
  archived: "bg-slate-200 text-slate-700",
};

export default function PayrollPeriodsPage() {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", date_from: "", date_to: "" });

  async function refresh() {
    setLoading(true);
    const res = await fetch("/api/hr/payroll", { cache: "no-store" });
    const data = await res.json();
    setPeriods(data?.periods ?? []);
    setLoading(false);
  }

  useEffect(() => { refresh(); }, []);

  async function createPeriod(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/hr/payroll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      alert(d?.error?.message ?? "Failed to create period");
      return;
    }
    setCreating(false);
    setForm({ name: "", date_from: "", date_to: "" });
    refresh();
  }

  async function finalize(period: Period, stage: "soft" | "hard") {
    if (stage === "hard" && !confirm(`Hard-lock "${period.name}"? This is irreversible.`)) return;
    const res = await fetch(`/api/hr/payroll/${period.id}/finalize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      alert(d?.error?.message ?? "Finalize failed");
      return;
    }
    refresh();
  }

  return (
    <div className="min-h-full p-8">
      <header className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Payroll Periods</h1>
          <p className="text-sm text-slate-500 mt-0.5">Lock lifecycle: none → soft (48h) → hard (irreversible) → archived (90d)</p>
        </div>
        <button
          onClick={() => setCreating((c) => !c)}
          className="px-4 py-2.5 rounded-xl text-sm font-bold text-white shadow-sm"
          style={{ background: "#16a34a" }}
        >
          {creating ? "Cancel" : "+ New Period"}
        </button>
      </header>

      {creating && (
        <form onSubmit={createPeriod} className="bg-white border border-slate-200 rounded-lg p-5 mb-5 shadow-sm grid grid-cols-12 gap-3">
          <div className="col-span-6">
            <label className="text-xs font-semibold text-slate-600">Name</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              placeholder="e.g. April 2026 Cycle 1"
              className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-200 text-sm"
            />
          </div>
          <div className="col-span-3">
            <label className="text-xs font-semibold text-slate-600">From</label>
            <input
              type="date"
              value={form.date_from}
              onChange={(e) => setForm({ ...form, date_from: e.target.value })}
              required
              className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-200 text-sm"
            />
          </div>
          <div className="col-span-3">
            <label className="text-xs font-semibold text-slate-600">To</label>
            <input
              type="date"
              value={form.date_to}
              onChange={(e) => setForm({ ...form, date_to: e.target.value })}
              required
              className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-200 text-sm"
            />
          </div>
          <div className="col-span-12 flex justify-end">
            <button type="submit" className="px-4 py-2 rounded-lg text-sm font-bold text-white" style={{ background: "#16a34a" }}>
              Create Period
            </button>
          </div>
        </form>
      )}

      <div className="bg-white border border-slate-200 rounded-lg shadow-sm">
        {loading ? (
          <div className="p-6 space-y-3">
            <div className="h-16 skeleton" />
            <div className="h-16 skeleton" />
          </div>
        ) : periods.length === 0 ? (
          <p className="p-10 text-center text-sm text-slate-400">No payroll periods yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {periods.map((p) => {
              const canSoft = p.lock_stage === "none";
              const canHard = p.lock_stage === "soft";
              return (
                <li key={p.id} className="px-5 py-4 flex items-center gap-4">
                  <span className={`text-xs px-2.5 py-1 rounded-full font-semibold uppercase shrink-0 ${STAGE_BADGE[p.lock_stage]}`}>
                    {p.lock_stage}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate">{p.name}</p>
                    <p className="text-xs text-slate-500">
                      {p.date_from} → {p.date_to} · {p.record_count} records
                    </p>
                    {p.soft_lock_expires_at && p.lock_stage === "soft" && (
                      <p className="text-xs text-amber-600 mt-0.5">
                        Soft lock expires {new Date(p.soft_lock_expires_at).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {canSoft && (
                      <button
                        onClick={() => finalize(p, "soft")}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold text-amber-800 bg-amber-100 hover:bg-amber-200"
                      >
                        Soft Lock
                      </button>
                    )}
                    {canHard && (
                      <button
                        onClick={() => finalize(p, "hard")}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-red-600 hover:bg-red-700"
                      >
                        Finalize (Hard Lock)
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
