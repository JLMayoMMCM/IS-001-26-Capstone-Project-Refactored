"use client";

import { useEffect, useState } from "react";

type Export = {
  id: string;
  date_from: string;
  date_to: string;
  format: "csv" | "pdf";
  record_count: number;
  storage_path: string | null;
  exported_at: string;
  exporter: { full_name: string } | null;
};

export default function HRExportsPage() {
  const [exports, setExports] = useState<Export[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ date_from: defaultStart(), date_to: today() });
  const [error, setError] = useState<string | null>(null);
  const [latestUrl, setLatestUrl] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    const res = await fetch("/api/hr/exports", { cache: "no-store" });
    const data = await res.json();
    setExports(data?.exports ?? []);
    setLoading(false);
  }

  useEffect(() => { refresh(); }, []);

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreating(true);
    setLatestUrl(null);
    try {
      const res = await fetch("/api/hr/exports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? "Export failed");
      setLatestUrl(data?.signed_url ?? null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="min-h-full p-8">
      <header className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">HR Exports</h1>
        <p className="text-sm text-slate-500 mt-0.5">Generate CSV and download signed URLs (60s TTL)</p>
      </header>

      {/* Generator */}
      <form onSubmit={generate} className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm mb-5">
        <h2 className="text-sm font-bold text-slate-900 mb-3">Generate Export</h2>

        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4 text-xs text-amber-900">
          <p className="font-semibold">⚠ Soft Lock Notice</p>
          <p className="mt-1">If a payroll period is selected and currently unlocked, this export will trigger a 48-hour Soft Lock.</p>
        </div>

        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-4">
            <label className="text-xs font-semibold text-slate-600">From</label>
            <input
              type="date"
              value={form.date_from}
              onChange={(e) => setForm({ ...form, date_from: e.target.value })}
              required
              className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-200 text-sm"
            />
          </div>
          <div className="col-span-4">
            <label className="text-xs font-semibold text-slate-600">To</label>
            <input
              type="date"
              value={form.date_to}
              onChange={(e) => setForm({ ...form, date_to: e.target.value })}
              required
              className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-200 text-sm"
            />
          </div>
          <div className="col-span-4 flex items-end">
            <button
              type="submit"
              disabled={creating}
              className="w-full py-2.5 rounded-lg text-sm font-bold text-white shadow-sm disabled:opacity-50"
              style={{ background: "linear-gradient(135deg,#16a34a,#15803d)" }}
            >
              {creating ? "Generating…" : "Export & Lock CSV"}
            </button>
          </div>
        </div>

        {error && <p className="mt-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

        {latestUrl && (
          <div className="mt-3 bg-green-50 border border-green-200 rounded-lg px-3 py-3">
            <p className="text-xs font-semibold text-green-800">Export ready (URL expires in 60s)</p>
            <a
              href={latestUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-green-700 underline break-all"
            >
              {latestUrl}
            </a>
          </div>
        )}
      </form>

      {/* History */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-sm">
        <header className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900">Export History</h2>
          <span className="text-xs text-slate-400">{exports.length} total</span>
        </header>
        {loading ? (
          <div className="p-6 space-y-3">
            <div className="h-12 skeleton" />
            <div className="h-12 skeleton" />
          </div>
        ) : exports.length === 0 ? (
          <p className="p-10 text-center text-sm text-slate-400">No exports yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {exports.map((ex) => (
              <li key={ex.id} className="px-5 py-3 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-900">
                    {ex.date_from} → {ex.date_to}
                    <span className="ml-2 text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-mono uppercase">
                      {ex.format}
                    </span>
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {ex.record_count} records · By {ex.exporter?.full_name ?? "Unknown"} ·
                    {" "}
                    {new Date(ex.exported_at).toLocaleString()}
                  </p>
                </div>
                {ex.storage_path ? (
                  <span className="text-xs text-slate-400 font-mono">{ex.storage_path.split("/").pop()}</span>
                ) : (
                  <span className="text-xs text-slate-400">Purged</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function today() { return new Date().toISOString().slice(0, 10); }
function defaultStart() {
  const d = new Date();
  d.setDate(d.getDate() - 14);
  return d.toISOString().slice(0, 10);
}
