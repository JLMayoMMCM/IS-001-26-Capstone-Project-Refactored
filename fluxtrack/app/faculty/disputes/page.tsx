"use client";

import { useCallback, useEffect, useState } from "react";
import EmptyState from "@/components/ui/empty-state";

type Dispute = {
  id: string;
  session_id: string;
  reason_category: "wlan_issue" | "camera_issue" | "schedule_error" | "checker_error" | "other";
  explanation: string;
  evidence_storage_path: string | null;
  filed_at: string;
  deadline_at: string;
  status: "pending" | "approved" | "denied" | "escalated";
  decision_note: string | null;
  remedial_action: string | null;
  source: "faculty" | "hr_flag";
  session?: {
    session_date: string;
    status: string;
    room?: { room_code: string; building: string };
    schedule?: { course_code: string; course_name: string };
  };
};

type Session = {
  id: string;
  session_date: string;
  status: string;
  schedule?: { course_code: string; course_name: string };
  room?: { room_code: string };
};

const REASONS = [
  { value: "wlan_issue", label: "WLAN issue" },
  { value: "camera_issue", label: "Camera issue" },
  { value: "schedule_error", label: "Schedule error" },
  { value: "checker_error", label: "Checker error" },
  { value: "other", label: "Other" },
] as const;

export default function FacultyDisputesPage() {
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [recent, setRecent] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [form, setForm] = useState({
    session_id: "",
    reason_category: "schedule_error" as Dispute["reason_category"],
    explanation: "",
  });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [dRes, sRes] = await Promise.all([
        fetch("/apis/disputes", { cache: "no-store" }),
        fetch("/apis/sessions?scope=mine&disputable=1", { cache: "no-store" }),
      ]);
      if (!dRes.ok) throw new Error(`disputes: HTTP ${dRes.status}`);
      const d = (await dRes.json()) as { disputes: Dispute[] };
      setDisputes(d.disputes);
      if (sRes.ok) {
        const s = (await sRes.json()) as { sessions: Session[] };
        setRecent(s.sessions ?? []);
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

  async function uploadEvidence(): Promise<string | null> {
    if (!file) return null;
    const fd = new FormData();
    fd.set("file", file);
    fd.set("prefix", "disputes");
    const res = await fetch("/apis/photos/upload", { method: "POST", body: fd });
    if (!res.ok) {
      const j = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      throw new Error(j?.error?.message ?? `upload HTTP ${res.status}`);
    }
    const j = (await res.json()) as { storage_path?: string; path?: string };
    return j.storage_path ?? j.path ?? null;
  }

  async function file_() {
    if (!form.session_id || form.explanation.trim().length < 50) {
      setError("Pick a session and write an explanation (≥ 50 chars).");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let path: string | null = null;
      if (file) path = await uploadEvidence();

      const res = await fetch("/apis/disputes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          session_id: form.session_id,
          reason_category: form.reason_category,
          explanation: form.explanation.trim(),
          evidence_storage_path: path,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(j?.error?.message ?? `HTTP ${res.status}`);
      }
      setToast("Dispute filed.");
      setTimeout(() => setToast(null), 3000);
      setForm({ session_id: "", reason_category: "schedule_error", explanation: "" });
      setFile(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <header>
          <h1 className="text-2xl font-semibold text-slate-900">My Disputes</h1>
          <p className="text-sm text-slate-500">
            File a dispute against a session result (absent, early end, checker flag, overstay). Window: 7 days
            from the session date.
          </p>
        </header>

        {toast && (
          <div className="text-xs px-3 py-2 rounded-md bg-emerald-100 text-emerald-700 inline-block">{toast}</div>
        )}
        {error && <div className="text-xs text-rose-600">{error}</div>}

        {/* File form */}
        <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
          <h2 className="text-sm font-medium text-slate-900">File a new dispute</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-xs">
              Session
              <select
                className="block mt-1 text-sm border border-slate-200 rounded-md px-2 py-2 w-full"
                value={form.session_id}
                onChange={(e) => setForm({ ...form, session_id: e.target.value })}
              >
                <option value="">— pick a session —</option>
                {recent.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.session_date} · {s.schedule?.course_code ?? "—"} · {s.status}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs">
              Reason
              <select
                className="block mt-1 text-sm border border-slate-200 rounded-md px-2 py-2 w-full"
                value={form.reason_category}
                onChange={(e) =>
                  setForm({ ...form, reason_category: e.target.value as Dispute["reason_category"] })
                }
              >
                {REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="text-xs block">
            Explanation
            <textarea
              className="block mt-1 w-full text-sm border border-slate-200 rounded-md px-2 py-2 min-h-28"
              placeholder="Describe what happened in at least 50 characters…"
              value={form.explanation}
              onChange={(e) => setForm({ ...form, explanation: e.target.value })}
            />
            <span className="text-[10px] text-slate-400">{form.explanation.length} chars (min 50)</span>
          </label>
          <label className="text-xs block">
            Evidence (optional — photo / screenshot)
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block mt-1 text-xs"
            />
          </label>
          <div className="flex justify-end">
            <button
              onClick={file_}
              disabled={busy || form.explanation.trim().length < 50 || !form.session_id}
              className="px-3 py-1.5 rounded-md bg-slate-900 text-white text-sm font-medium disabled:opacity-50"
            >
              {busy ? "Filing…" : "File dispute"}
            </button>
          </div>
        </section>

        {/* List */}
        <section>
          <h2 className="text-sm font-medium text-slate-900 mb-3">History</h2>
          {loading ? (
            <div className="text-sm text-slate-500">Loading…</div>
          ) : disputes.length === 0 ? (
            <EmptyState title="No disputes filed" description="Use the form above to file one when needed." />
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="text-left px-4 py-2">Filed</th>
                    <th className="text-left px-4 py-2">Session</th>
                    <th className="text-left px-4 py-2">Reason</th>
                    <th className="text-left px-4 py-2">Status</th>
                    <th className="text-left px-4 py-2">Deadline</th>
                  </tr>
                </thead>
                <tbody>
                  {disputes.map((d) => (
                    <tr key={d.id} className="border-t border-slate-100 align-top">
                      <td className="px-4 py-2 text-slate-500 whitespace-nowrap">
                        {new Date(d.filed_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-2 text-slate-700">
                        {d.session?.schedule?.course_code ?? "—"} · {d.session?.session_date ?? "—"}
                      </td>
                      <td className="px-4 py-2 text-slate-700">
                        {REASONS.find((r) => r.value === d.reason_category)?.label ?? d.reason_category}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            d.status === "approved"
                              ? "bg-emerald-100 text-emerald-700"
                              : d.status === "denied"
                              ? "bg-rose-100 text-rose-700"
                              : d.status === "escalated"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-slate-200 text-slate-700"
                          }`}
                        >
                          {d.status}
                        </span>
                        {d.source === "hr_flag" && (
                          <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700">
                            HR
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-slate-500 whitespace-nowrap">
                        {new Date(d.deadline_at).toLocaleString()}
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
