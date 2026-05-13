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

type Section = {
  id: string;
  academic_term_id: string;
  section_code: string;
  program: string | null;
  year_level: number | null;
  student_count: number;
  is_active: boolean;
  academic_terms: { code: string; name: string } | null;
};

export default function IFOSectionsPage() {
  const [terms, setTerms] = useState<Term[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [termFilter, setTermFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    academic_term_id: "",
    section_code: "",
    program: "",
    year_level: "",
    student_count: "0",
  });
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [tRes, sRes] = await Promise.all([
        fetch("/apis/academic-terms", { cache: "no-store" }),
        fetch(`/apis/sections${termFilter ? `?term_id=${termFilter}&active=0` : "?active=0"}`, {
          cache: "no-store",
        }),
      ]);
      if (!tRes.ok) throw new Error(`terms: HTTP ${tRes.status}`);
      if (!sRes.ok) throw new Error(`sections: HTTP ${sRes.status}`);
      const t = (await tRes.json()) as { terms: Term[] };
      const s = (await sRes.json()) as { sections: Section[] };
      setTerms(t.terms);
      setSections(s.sections);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [termFilter]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function create() {
    if (!form.academic_term_id || !form.section_code.trim()) {
      setError("Pick a term and enter a section code.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/apis/sections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          academic_term_id: form.academic_term_id,
          section_code: form.section_code.trim(),
          program: form.program.trim() || null,
          year_level: form.year_level ? Number(form.year_level) : null,
          student_count: form.student_count ? Number(form.student_count) : 0,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(j?.error?.message ?? `HTTP ${res.status}`);
      }
      setForm({ academic_term_id: form.academic_term_id, section_code: "", program: "", year_level: "", student_count: "0" });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(s: Section) {
    setBusy(true);
    try {
      const res = await fetch(`/apis/sections/${s.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ is_active: !s.is_active }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <header className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Sections</h1>
            <p className="text-sm text-slate-500">
              Manage the per-term student section catalog. Section conflicts block overlapping schedules.
            </p>
          </div>
          <select
            className="text-sm border border-slate-200 rounded-md px-2 py-1 bg-white"
            value={termFilter}
            onChange={(e) => setTermFilter(e.target.value)}
          >
            <option value="">All terms</option>
            {terms.map((t) => (
              <option key={t.id} value={t.id}>
                {t.code} — {t.name}
              </option>
            ))}
          </select>
        </header>

        {/* Create form */}
        <section className="bg-white rounded-xl border border-slate-200 p-4">
          <h2 className="text-sm font-medium text-slate-900 mb-3">New section</h2>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
            <select
              className="text-sm border border-slate-200 rounded-md px-2 py-2 bg-white"
              value={form.academic_term_id}
              onChange={(e) => setForm({ ...form, academic_term_id: e.target.value })}
            >
              <option value="">Term…</option>
              {terms.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.code}
                </option>
              ))}
            </select>
            <input
              className="text-sm border border-slate-200 rounded-md px-2 py-2 bg-white"
              placeholder="Section code (e.g. BSCS-2A)"
              value={form.section_code}
              onChange={(e) => setForm({ ...form, section_code: e.target.value })}
            />
            <input
              className="text-sm border border-slate-200 rounded-md px-2 py-2 bg-white"
              placeholder="Program"
              value={form.program}
              onChange={(e) => setForm({ ...form, program: e.target.value })}
            />
            <input
              className="text-sm border border-slate-200 rounded-md px-2 py-2 bg-white"
              type="number"
              placeholder="Year level"
              value={form.year_level}
              onChange={(e) => setForm({ ...form, year_level: e.target.value })}
            />
            <input
              className="text-sm border border-slate-200 rounded-md px-2 py-2 bg-white"
              type="number"
              placeholder="Student count"
              value={form.student_count}
              onChange={(e) => setForm({ ...form, student_count: e.target.value })}
            />
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={create}
              disabled={busy}
              className="px-3 py-2 rounded-md bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-50"
            >
              Create section
            </button>
            {error && <span className="text-xs text-rose-600">{error}</span>}
          </div>
        </section>

        {/* List */}
        <section>
          {loading ? (
            <div className="text-sm text-slate-500">Loading…</div>
          ) : sections.length === 0 ? (
            <EmptyState
              title="No sections yet"
              description="Create the first section for the selected term using the form above."
            />
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="text-left px-4 py-2">Term</th>
                    <th className="text-left px-4 py-2">Section</th>
                    <th className="text-left px-4 py-2">Program</th>
                    <th className="text-left px-4 py-2">Year</th>
                    <th className="text-left px-4 py-2">Students</th>
                    <th className="text-left px-4 py-2">Status</th>
                    <th className="text-right px-4 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sections.map((s) => (
                    <tr key={s.id} className="border-t border-slate-100">
                      <td className="px-4 py-2 text-slate-500">{s.academic_terms?.code ?? "—"}</td>
                      <td className="px-4 py-2 font-medium text-slate-900">{s.section_code}</td>
                      <td className="px-4 py-2 text-slate-700">{s.program ?? "—"}</td>
                      <td className="px-4 py-2 text-slate-700">{s.year_level ?? "—"}</td>
                      <td className="px-4 py-2 text-slate-700">{s.student_count}</td>
                      <td className="px-4 py-2">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            s.is_active
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-slate-200 text-slate-600"
                          }`}
                        >
                          {s.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <button
                          onClick={() => toggleActive(s)}
                          disabled={busy}
                          className="text-xs px-2 py-1 rounded-md border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
                        >
                          {s.is_active ? "Deactivate" : "Reactivate"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </>
  );
}
