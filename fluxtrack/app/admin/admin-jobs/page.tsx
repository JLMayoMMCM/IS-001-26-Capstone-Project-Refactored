"use client";

import { useCallback, useEffect, useState } from "react";

type Job = { jobid: number; schedule: string; command: string; jobname: string; active: boolean };

const RUNNABLE = [
  { key: "materialize_sessions", label: "Materialize sessions", note: "Insert scheduled sessions for the next 14 days." },
  { key: "photo_cleanup", label: "Photo cleanup", note: "Purge expired session photos (30-day retention)." },
  { key: "export_cleanup", label: "Export cleanup", note: "Purge expired HR exports (30-day retention)." },
] as const;

export default function AdminJobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/apis/admin/jobs", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as { jobs: Job[]; note?: string };
      setJobs(j.jobs);
      setNote(j.note ?? null);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function runNow(jobKey: typeof RUNNABLE[number]["key"]) {
    setBusy(jobKey);
    setError(null);
    try {
      const res = await fetch("/apis/admin/jobs/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ job: jobKey }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(j?.error?.message ?? `HTTP ${res.status}`);
      }
      const j = await res.json();
      setToast(`Triggered ${jobKey}: ${JSON.stringify(j.result)}`);
      setTimeout(() => setToast(null), 5000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Scheduled Jobs</h1>
        <p className="text-sm text-slate-500">View pg_cron jobs and ad-hoc trigger the cleanups / materializer.</p>
      </header>

      {toast && (
        <div className="text-xs px-3 py-2 rounded-md bg-emerald-100 text-emerald-700 inline-block">{toast}</div>
      )}
      {error && <div className="text-xs text-rose-600">{error}</div>}

      <section>
        <h2 className="text-sm font-medium text-slate-900 mb-2">Run now</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {RUNNABLE.map((r) => (
            <div key={r.key} className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col gap-2">
              <div className="font-medium text-slate-900 text-sm">{r.label}</div>
              <div className="text-xs text-slate-500 flex-1">{r.note}</div>
              <button
                onClick={() => runNow(r.key)}
                disabled={busy !== null}
                className="text-xs px-3 py-1.5 rounded-md bg-slate-900 text-white disabled:opacity-50"
              >
                {busy === r.key ? "Running…" : "Run now"}
              </button>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-medium text-slate-900 mb-2">Scheduled jobs (pg_cron)</h2>
        {note && <div className="text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded-md mb-2">{note}</div>}
        {jobs.length === 0 ? (
          <div className="text-xs text-slate-500">No jobs found.</div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-2">Name</th>
                  <th className="text-left px-4 py-2">Schedule</th>
                  <th className="text-left px-4 py-2">Active</th>
                  <th className="text-left px-4 py-2">Command</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.jobid} className="border-t border-slate-100">
                    <td className="px-4 py-2 text-slate-900 font-medium">{j.jobname}</td>
                    <td className="px-4 py-2 font-mono text-xs">{j.schedule}</td>
                    <td className="px-4 py-2">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          j.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"
                        }`}
                      >
                        {j.active ? "Active" : "Disabled"}
                      </span>
                    </td>
                    <td className="px-4 py-2 font-mono text-[10px] text-slate-500 truncate max-w-md">{j.command}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
