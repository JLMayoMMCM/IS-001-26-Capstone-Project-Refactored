"use client";

import { useState } from "react";

type ImportError = { row: number; message: string };

export default function ImportSchedulePage() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ inserted: number; rejected: number; errors: ImportError[]; total_rows: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/schedules/import", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? "Import failed");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-full p-8">
      <header className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">Schedule Import</h1>
        <p className="text-sm text-slate-500 mt-0.5">Upload a CSV of class schedules for the academic term</p>
      </header>

      <div className="grid grid-cols-3 gap-6">
        <form onSubmit={submit} className="col-span-2 bg-white border border-slate-200 rounded-lg p-6 shadow-sm space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-2 uppercase tracking-wider">CSV File</label>
            <div
              className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:border-blue-400 transition-colors cursor-pointer"
              onClick={() => document.getElementById("csv-input")?.click()}
            >
              <input
                id="csv-input"
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="hidden"
              />
              {file ? (
                <>
                  <p className="text-sm font-bold text-slate-900">{file.name}</p>
                  <p className="text-xs text-slate-500 mt-1">{(file.size / 1024).toFixed(1)} KB</p>
                </>
              ) : (
                <>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-2 text-slate-400">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  <p className="text-sm font-semibold text-slate-700">Click to select a CSV file</p>
                  <p className="text-xs text-slate-400 mt-1">Required columns shown on the right</p>
                </>
              )}
            </div>
          </div>

          {error && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={!file || busy}
              className="px-5 py-2.5 rounded-xl text-sm font-bold text-white shadow-sm disabled:opacity-50"
              style={{ background: "#7c3aed" }}
            >
              {busy ? "Importing…" : "Validate & Import"}
            </button>
          </div>

          {result && (
            <div className="mt-2 border-t border-slate-100 pt-4">
              <div className="grid grid-cols-3 gap-3 mb-3">
                <Stat label="Total rows" value={result.total_rows} />
                <Stat label="Inserted" value={result.inserted} color="text-green-600" />
                <Stat label="Rejected" value={result.rejected} color={result.rejected > 0 ? "text-red-600" : "text-slate-600"} />
              </div>
              {result.errors.length > 0 && (
                <details className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs">
                  <summary className="cursor-pointer font-bold text-red-800">{result.errors.length} row error(s)</summary>
                  <ul className="mt-2 space-y-1">
                    {result.errors.slice(0, 50).map((e) => (
                      <li key={e.row} className="text-red-700">
                        <span className="font-mono">L{e.row}:</span> {e.message}
                      </li>
                    ))}
                    {result.errors.length > 50 && (
                      <li className="text-red-500">… {result.errors.length - 50} more</li>
                    )}
                  </ul>
                </details>
              )}
            </div>
          )}
        </form>

        <aside className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900 mb-3">Required CSV Columns</h3>
          <ul className="space-y-1 text-xs text-slate-600">
            {[
              "course_code",
              "course_name",
              "section",
              "enrolled_count",
              "scheduled_modality (f2f|blended|online)",
              "day_of_week (mon|tue|...|sat)",
              "start_time (HH:MM)",
              "end_time (HH:MM)",
              "academic_term",
              "faculty_email",
              "room_code",
            ].map((c) => (
              <li key={c} className="font-mono px-2 py-1 rounded bg-slate-50 border border-slate-100">
                {c}
              </li>
            ))}
          </ul>
          <p className="text-xs text-slate-400 mt-3">
            Faculty resolved by email; rooms by room_code. Rows with unresolved references are rejected.
          </p>
        </aside>
      </div>
    </div>
  );
}

function Stat({ label, value, color = "text-slate-900" }: { label: string; value: number; color?: string }) {
  return (
    <div className="bg-slate-50 rounded-xl p-3 text-center">
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-slate-400">{label}</p>
    </div>
  );
}
