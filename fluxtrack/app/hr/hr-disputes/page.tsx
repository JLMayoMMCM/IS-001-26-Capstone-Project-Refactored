"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import EmptyState from "@/components/ui/empty-state";

type Session = {
  id: string;
  session_date: string;
  status: "scheduled" | "pending" | "active" | "en_route" | "completed" | "early_end" | "absent" | "overstay" | "checker_flagged";
  schedule?: { course_code: string; course_name: string } | null;
  faculty?: { full_name: string; email: string } | null;
  room?: { room_code: string } | null;
  hr_flag_note?: string | null;
};

type DisputeReason = "wlan_issue" | "camera_issue" | "schedule_error" | "checker_error" | "other";

const REASON_LABEL: Record<DisputeReason, string> = {
  wlan_issue:     "WLAN issue",
  camera_issue:   "Camera issue",
  schedule_error: "Schedule error",
  checker_error:  "Checker error",
  other:          "Other",
};

const FLAGGABLE_STATUSES: ReadonlySet<Session["status"]> = new Set([
  "absent", "early_end", "checker_flagged", "overstay", "completed",
]);

export default function HRDisputesPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | Session["status"]>("all");
  const [error, setError] = useState<string | null>(null);

  const [active, setActive] = useState<Session | null>(null);
  const [reason, setReason] = useState<DisputeReason>("schedule_error");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/apis/hr/records?limit=200", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as { records?: Session[]; sessions?: Session[] };
      setSessions(j.records ?? j.sessions ?? []);
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

  const filtered = sessions
    .filter((s) => FLAGGABLE_STATUSES.has(s.status))
    .filter((s) => statusFilter === "all" || s.status === statusFilter)
    .filter((s) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        (s.faculty?.full_name ?? "").toLowerCase().includes(q) ||
        (s.schedule?.course_code ?? "").toLowerCase().includes(q) ||
        (s.room?.room_code ?? "").toLowerCase().includes(q)
      );
    });

  async function flag() {
    if (!active) return;
    if (note.trim().length < 20) {
      setError("HR flag note must be at least 20 characters.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/apis/hr/disputes/flag", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          session_id: active.id,
          reason_category: reason,
          hr_flag_note: note.trim(),
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(j?.error?.message ?? `HTTP ${res.status}`);
      }
      setToast("HR-flag dispute filed.");
      setTimeout(() => setToast(null), 3000);
      setActive(null);
      setNote("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">HR Disputes</h1>
          <p className="text-sm text-slate-500">
            Flag a problematic session for IFO review. Filed disputes carry source = <span className="font-mono">hr_flag</span>.
          </p>
        </div>
        <Link
          href="/hr/hr-records"
          className="text-xs px-3 py-1.5 rounded-md border border-slate-200 hover:bg-slate-50"
        >
          View all records →
        </Link>
      </header>

      {toast && (
        <div className="text-xs px-3 py-2 rounded-md bg-emerald-100 text-emerald-700 inline-block">{toast}</div>
      )}

      <section className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3 flex-wrap">
        <select
          className="text-sm border border-slate-200 rounded-md px-2 py-1.5 bg-white"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
        >
          <option value="all">All flaggable statuses</option>
          {Array.from(FLAGGABLE_STATUSES).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <input
          className="flex-1 min-w-48 text-sm border border-slate-200 rounded-md px-2 py-1.5"
          placeholder="Search faculty / course / room…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="text-xs text-slate-500">
          {filtered.length} match{filtered.length === 1 ? "" : "es"}
        </span>
      </section>

      {error && !active && <div className="text-xs text-rose-600">{error}</div>}

      {loading ? (
        <div className="text-sm text-slate-500">Loading…</div>
      ) : filtered.length === 0 ? (
        <EmptyState title="No flaggable sessions match the current filters" />
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2">Date</th>
                <th className="text-left px-4 py-2">Faculty</th>
                <th className="text-left px-4 py-2">Course</th>
                <th className="text-left px-4 py-2">Room</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="text-right px-4 py-2">&nbsp;</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 text-slate-500">{s.session_date}</td>
                  <td className="px-4 py-2 text-slate-700">{s.faculty?.full_name ?? "—"}</td>
                  <td className="px-4 py-2 text-slate-700">{s.schedule?.course_code ?? "—"}</td>
                  <td className="px-4 py-2 text-slate-700 font-mono">{s.room?.room_code ?? "—"}</td>
                  <td className="px-4 py-2">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">{s.status}</span>
                    {s.hr_flag_note && (
                      <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">already flagged</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => {
                        setActive(s);
                        setNote("");
                        setReason("schedule_error");
                        setError(null);
                      }}
                      disabled={!!s.hr_flag_note}
                      className="text-xs px-2 py-1 rounded-md bg-slate-900 text-white disabled:opacity-40"
                    >
                      Flag for review
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {active && (
        <div className="fixed inset-0 bg-slate-900/40 z-40 grid place-items-center px-4">
          <div className="w-full max-w-lg bg-white rounded-xl shadow-xl border border-slate-200 p-5 space-y-3">
            <header className="flex items-start justify-between">
              <div>
                <h2 className="text-base font-semibold">Flag for IFO review</h2>
                <p className="text-xs text-slate-500">
                  {active.faculty?.full_name} · {active.schedule?.course_code} · {active.session_date}
                </p>
              </div>
              <button onClick={() => setActive(null)} className="text-slate-400 hover:text-slate-600">✕</button>
            </header>
            <label className="text-xs block">
              Reason
              <select
                className="block mt-1 text-sm border border-slate-200 rounded-md px-2 py-2 w-full bg-white"
                value={reason}
                onChange={(e) => setReason(e.target.value as DisputeReason)}
              >
                {Object.entries(REASON_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </label>
            <label className="text-xs block">
              HR flag note (≥ 20 chars)
              <textarea
                className="block mt-1 w-full text-sm border border-slate-200 rounded-md px-2 py-2 min-h-28"
                placeholder="Describe the inconsistency you spotted (modality mismatch, photo missing, etc.)…"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <span className="text-[10px] text-slate-400">{note.length} chars (min 20)</span>
            </label>
            {error && <div className="text-xs text-rose-600">{error}</div>}
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setActive(null)}
                className="text-xs px-3 py-1.5 border border-slate-200 rounded-md"
              >
                Cancel
              </button>
              <button
                onClick={flag}
                disabled={busy || note.trim().length < 20}
                className="text-xs px-3 py-1.5 rounded-md bg-amber-600 text-white disabled:opacity-50"
              >
                {busy ? "Filing…" : "File HR-flag dispute"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
