"use client";

import { useCallback, useEffect, useState } from "react";
import EmptyState from "@/components/ui/empty-state";

type Term = {
  id: string;
  code: string;
  name: string;
  term_start_date: string;
  term_end_date: string;
  is_active: boolean;
};

type Break = {
  id: string;
  term_id: string;
  date_from: string;
  date_to: string;
  label: string;
  is_active: boolean;
};

export default function AcademicCalendarPage() {
  const [terms, setTerms] = useState<Term[]>([]);
  const [breaks, setBreaks] = useState<Break[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [termForm, setTermForm] = useState({ code: "", name: "", term_start_date: "", term_end_date: "" });
  const [breakForm, setBreakForm] = useState({ term_id: "", date_from: "", date_to: "", label: "" });

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [tRes, bRes] = await Promise.all([
        fetch("/apis/academic-terms", { cache: "no-store" }),
        fetch("/apis/academic-breaks", { cache: "no-store" }),
      ]);
      if (!tRes.ok) throw new Error(`terms: HTTP ${tRes.status}`);
      if (!bRes.ok) throw new Error(`breaks: HTTP ${bRes.status}`);
      const t = (await tRes.json()) as { terms: Term[] };
      const b = (await bRes.json()) as { breaks: Break[] };
      setTerms(t.terms);
      setBreaks(b.breaks);
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

  async function createTerm() {
    if (!termForm.code || !termForm.name || !termForm.term_start_date || !termForm.term_end_date) {
      setError("All term fields are required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/apis/academic-terms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(termForm),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(j?.error?.message ?? `HTTP ${res.status}`);
      }
      setTermForm({ code: "", name: "", term_start_date: "", term_end_date: "" });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function createBreak() {
    if (!breakForm.term_id || !breakForm.date_from || !breakForm.date_to || !breakForm.label) {
      setError("All break fields are required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/apis/academic-breaks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(breakForm),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(j?.error?.message ?? `HTTP ${res.status}`);
      }
      setBreakForm({ term_id: breakForm.term_id, date_from: "", date_to: "", label: "" });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-8">
        <header>
          <h1 className="text-2xl font-semibold text-slate-900">Academic Calendar</h1>
          <p className="text-sm text-slate-500">
            Define academic terms and break/holiday dates. These drive the auto-materialization of class sessions.
          </p>
        </header>

        {error && <div className="text-xs text-rose-600">{error}</div>}

        {/* Terms */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-slate-900">Terms</h2>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 mb-3">
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
              <input
                className="text-sm border border-slate-200 rounded-md px-2 py-2"
                placeholder="Code (e.g. 2026-1T)"
                value={termForm.code}
                onChange={(e) => setTermForm({ ...termForm, code: e.target.value })}
              />
              <input
                className="text-sm border border-slate-200 rounded-md px-2 py-2"
                placeholder="Name"
                value={termForm.name}
                onChange={(e) => setTermForm({ ...termForm, name: e.target.value })}
              />
              <input
                className="text-sm border border-slate-200 rounded-md px-2 py-2"
                type="date"
                value={termForm.term_start_date}
                onChange={(e) => setTermForm({ ...termForm, term_start_date: e.target.value })}
              />
              <input
                className="text-sm border border-slate-200 rounded-md px-2 py-2"
                type="date"
                value={termForm.term_end_date}
                onChange={(e) => setTermForm({ ...termForm, term_end_date: e.target.value })}
              />
              <button
                onClick={createTerm}
                disabled={busy}
                className="px-3 py-2 rounded-md bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-50"
              >
                Add term
              </button>
            </div>
          </div>
          {loading ? (
            <div className="text-sm text-slate-500">Loading…</div>
          ) : terms.length === 0 ? (
            <EmptyState title="No terms defined" description="Create the first term to enable schedule term-spans." />
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="text-left px-4 py-2">Code</th>
                    <th className="text-left px-4 py-2">Name</th>
                    <th className="text-left px-4 py-2">Start</th>
                    <th className="text-left px-4 py-2">End</th>
                    <th className="text-left px-4 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {terms.map((t) => (
                    <tr key={t.id} className="border-t border-slate-100">
                      <td className="px-4 py-2 font-medium text-slate-900">{t.code}</td>
                      <td className="px-4 py-2 text-slate-700">{t.name}</td>
                      <td className="px-4 py-2 text-slate-700">{t.term_start_date}</td>
                      <td className="px-4 py-2 text-slate-700">{t.term_end_date}</td>
                      <td className="px-4 py-2">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            t.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"
                          }`}
                        >
                          {t.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Breaks */}
        <section>
          <h2 className="text-sm font-medium text-slate-900 mb-3">Breaks &amp; Holidays</h2>
          <div className="bg-white rounded-xl border border-slate-200 p-4 mb-3">
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
              <select
                className="text-sm border border-slate-200 rounded-md px-2 py-2 bg-white"
                value={breakForm.term_id}
                onChange={(e) => setBreakForm({ ...breakForm, term_id: e.target.value })}
              >
                <option value="">Term…</option>
                {terms.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.code}
                  </option>
                ))}
              </select>
              <input
                className="text-sm border border-slate-200 rounded-md px-2 py-2"
                placeholder="Label (e.g. Holy Week)"
                value={breakForm.label}
                onChange={(e) => setBreakForm({ ...breakForm, label: e.target.value })}
              />
              <input
                className="text-sm border border-slate-200 rounded-md px-2 py-2"
                type="date"
                value={breakForm.date_from}
                onChange={(e) => setBreakForm({ ...breakForm, date_from: e.target.value })}
              />
              <input
                className="text-sm border border-slate-200 rounded-md px-2 py-2"
                type="date"
                value={breakForm.date_to}
                onChange={(e) => setBreakForm({ ...breakForm, date_to: e.target.value })}
              />
              <button
                onClick={createBreak}
                disabled={busy}
                className="px-3 py-2 rounded-md bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-50"
              >
                Add break
              </button>
            </div>
          </div>
          {loading ? (
            <div className="text-sm text-slate-500">Loading…</div>
          ) : breaks.length === 0 ? (
            <EmptyState
              title="No breaks defined"
              description="Add holidays / breaks to skip auto-materialization for those dates."
            />
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="text-left px-4 py-2">Term</th>
                    <th className="text-left px-4 py-2">Label</th>
                    <th className="text-left px-4 py-2">From</th>
                    <th className="text-left px-4 py-2">To</th>
                  </tr>
                </thead>
                <tbody>
                  {breaks.map((b) => {
                    const term = terms.find((t) => t.id === b.term_id);
                    return (
                      <tr key={b.id} className="border-t border-slate-100">
                        <td className="px-4 py-2 text-slate-500">{term?.code ?? "—"}</td>
                        <td className="px-4 py-2 font-medium text-slate-900">{b.label}</td>
                        <td className="px-4 py-2 text-slate-700">{b.date_from}</td>
                        <td className="px-4 py-2 text-slate-700">{b.date_to}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </>
  );
}
