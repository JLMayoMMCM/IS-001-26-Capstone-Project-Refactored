"use client";

import { useCallback, useEffect, useState } from "react";
import EmptyState from "@/components/ui/empty-state";

type Dispute = {
  id: string;
  reason_category: string;
  explanation: string;
  filed_at: string;
  deadline_at: string;
  status: "pending" | "approved" | "denied" | "escalated";
  source: "faculty" | "hr_flag";
  decision_note: string | null;
  reviewed_at: string | null;
  evidence_storage_path: string | null;
  remedial_action: string | null;
  session: {
    id: string;
    session_date: string;
    status: string;
    schedule: { course_code: string; course_name: string } | null;
    room: { room_code: string; building: string } | null;
  } | null;
  faculty: { full_name: string; email: string; faculty_id: string | null } | null;
};

const STATUS_BADGE: Record<Dispute["status"], string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-700",
  denied: "bg-rose-100 text-rose-700",
  escalated: "bg-purple-100 text-purple-700",
};

type RemedialAction = "restore_completed" | "mark_early_end" | "keep_status" | "manual_adjust";

const REMEDIAL_LABEL: Record<RemedialAction, { label: string; desc: string }> = {
  restore_completed: { label: "Restore to completed", desc: "Session is treated as a normal completed class." },
  mark_early_end:    { label: "Mark early-end",       desc: "Session counts as taught but ended early." },
  keep_status:       { label: "Keep current status",  desc: "Approve the explanation but leave the session record unchanged." },
  manual_adjust:     { label: "Manual adjustment",    desc: "HR will hand-adjust the session offline; record approval only." },
};

export default function DisputeQueuePage() {
  const [filter, setFilter] = useState<Dispute["status"] | "all">("pending");
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<Dispute | null>(null);
  const [decisionMode, setDecisionMode] = useState<null | "approve" | "deny">(null);
  const [note, setNote] = useState("");
  const [remedial, setRemedial] = useState<RemedialAction>("keep_status");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const url = filter === "all" ? "/apis/disputes" : `/apis/disputes?status=${filter}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { disputes: Dispute[] };
      setDisputes(data?.disputes ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function startDecision(mode: "approve" | "deny") {
    setDecisionMode(mode);
    setNote("");
    setRemedial("keep_status");
    setError(null);
  }

  async function submitDecision() {
    if (!active || !decisionMode) return;
    const trimmed = note.trim();
    if (trimmed.length < 20) {
      setError("Decision note must be at least 20 characters.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { decision_note: trimmed };
      if (decisionMode === "approve") body.remedial_action = remedial;
      const res = await fetch(`/apis/disputes/${active.id}/${decisionMode}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(j?.error?.message ?? `HTTP ${res.status}`);
      }
      setActive(null);
      setDecisionMode(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <header>
          <h1 className="text-2xl font-semibold text-slate-900">Dispute Queue</h1>
          <p className="text-sm text-slate-500">Faculty attendance disputes — review by SLA urgency.</p>
        </header>

        <div className="flex gap-1 bg-slate-100 rounded-md p-1 text-xs w-fit">
          {(["pending", "approved", "denied", "escalated", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded ${filter === f ? "bg-white shadow-sm" : "text-slate-500"}`}
            >
              {f === "all" ? "All" : f[0].toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {error && !active && <div className="text-xs text-rose-600">{error}</div>}

        <div className="bg-white border border-slate-200 rounded-xl">
          {loading ? (
            <div className="p-6 text-sm text-slate-500">Loading…</div>
          ) : disputes.length === 0 ? (
            <EmptyState title="No disputes match this filter" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {disputes.map((d) => {
                const slaMs = new Date(d.deadline_at).getTime() - Date.now();
                const slaHrs = Math.max(0, Math.round(slaMs / 3_600_000));
                const slaSoon = slaHrs <= 24;
                return (
                  <li key={d.id}>
                    <button
                      onClick={() => {
                        setActive(d);
                        setDecisionMode(null);
                      }}
                      className="w-full text-left px-5 py-4 hover:bg-slate-50 flex items-start gap-4"
                    >
                      <span className={`text-xs px-2.5 py-1 rounded-full font-semibold shrink-0 ${STATUS_BADGE[d.status]}`}>
                        {d.status}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">
                          {d.faculty?.full_name ?? "Unknown faculty"} · {d.session?.schedule?.course_code ?? "—"}
                        </p>
                        <p className="text-xs text-slate-500 truncate">{d.explanation}</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Filed {new Date(d.filed_at).toLocaleString()} · Reason:{" "}
                          {d.reason_category.replace(/_/g, " ")}
                          {d.source === "hr_flag" && (
                            <span className="ml-2 px-1.5 rounded bg-amber-100 text-amber-700 font-semibold text-[10px]">
                              HR
                            </span>
                          )}
                        </p>
                      </div>
                      {d.status === "pending" && (
                        <div className="text-right shrink-0">
                          <p className={`text-xs font-bold ${slaSoon ? "text-rose-600" : "text-slate-500"}`}>
                            SLA: {slaHrs}h
                          </p>
                        </div>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </main>

      {active && (
        <aside className="fixed inset-y-0 right-0 w-full sm:w-[420px] bg-white shadow-2xl z-40 border-l border-slate-200 overflow-y-auto">
          <header className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3 sticky top-0 bg-white z-10">
            <div>
              <p className="text-base font-semibold text-slate-900">Dispute</p>
              <p className="text-xs text-slate-400 font-mono">{active.id.slice(0, 8)}…</p>
            </div>
            <button
              onClick={() => {
                setActive(null);
                setDecisionMode(null);
              }}
              className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400"
            >
              ✕
            </button>
          </header>

          <div className="px-5 py-4 space-y-4 text-sm">
            <Section label="Status">
              <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_BADGE[active.status]}`}>
                {active.status}
              </span>
              {active.source === "hr_flag" && (
                <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                  HR-flagged
                </span>
              )}
            </Section>
            <Section label="Faculty">
              <p className="text-slate-900">{active.faculty?.full_name ?? "—"}</p>
              <p className="text-xs text-slate-500">{active.faculty?.email}</p>
            </Section>
            <Section label="Session">
              <p className="text-slate-700">
                {active.session?.schedule?.course_code} — {active.session?.schedule?.course_name}
              </p>
              <p className="text-xs text-slate-500">
                Room {active.session?.room?.room_code} · {active.session?.session_date} ·{" "}
                {active.session?.status}
              </p>
            </Section>
            <Section label="Reason">
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                {active.reason_category.replace(/_/g, " ")}
              </span>
            </Section>
            <Section label="Explanation">
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{active.explanation}</p>
            </Section>
            {active.status !== "pending" && (
              <>
                {active.remedial_action && (
                  <Section label="Remedial action">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                      {REMEDIAL_LABEL[active.remedial_action as RemedialAction]?.label ?? active.remedial_action}
                    </span>
                  </Section>
                )}
                <Section label="Decision note">
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">
                    {active.decision_note ?? <span className="text-slate-400">—</span>}
                  </p>
                  {active.reviewed_at && (
                    <p className="text-xs text-slate-400 mt-1">
                      Reviewed {new Date(active.reviewed_at).toLocaleString()}
                    </p>
                  )}
                </Section>
              </>
            )}

            {active.status === "pending" && !decisionMode && (
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => startDecision("deny")}
                  className="flex-1 py-2 rounded-md border border-rose-200 text-rose-700 bg-rose-50 hover:bg-rose-100 text-sm font-medium"
                >
                  Deny
                </button>
                <button
                  onClick={() => startDecision("approve")}
                  className="flex-1 py-2 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
                >
                  Approve
                </button>
              </div>
            )}

            {decisionMode && (
              <div className="border-t border-slate-100 pt-3 space-y-3">
                <h3 className="text-sm font-medium text-slate-900">
                  {decisionMode === "approve" ? "Approve dispute" : "Deny dispute"}
                </h3>
                {decisionMode === "approve" && (
                  <div className="space-y-1">
                    <label className="text-xs text-slate-500">Remedial action</label>
                    <div className="space-y-1.5">
                      {(Object.keys(REMEDIAL_LABEL) as RemedialAction[]).map((ra) => (
                        <label
                          key={ra}
                          className={`block border rounded-md px-3 py-2 cursor-pointer ${
                            remedial === ra ? "border-slate-900 bg-slate-50" : "border-slate-200"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="radio"
                              name="remedial"
                              checked={remedial === ra}
                              onChange={() => setRemedial(ra)}
                            />
                            <span className="text-sm font-medium">{REMEDIAL_LABEL[ra].label}</span>
                          </div>
                          <div className="text-xs text-slate-500 ml-6 mt-0.5">{REMEDIAL_LABEL[ra].desc}</div>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <label className="text-xs text-slate-500">Decision note (≥ 20 chars)</label>
                  <textarea
                    className="block mt-1 w-full text-sm border border-slate-200 rounded-md px-2 py-2 min-h-24"
                    placeholder={
                      decisionMode === "approve"
                        ? "Explain the basis for approval and any follow-up the system did…"
                        : "Explain why the dispute is denied (evidence reviewed, etc.)…"
                    }
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                  <div className="text-[10px] text-slate-400">{note.length} chars (min 20)</div>
                </div>
                {error && <div className="text-xs text-rose-600">{error}</div>}
                <div className="flex justify-between gap-2 pt-1">
                  <button
                    onClick={() => {
                      setDecisionMode(null);
                      setError(null);
                    }}
                    className="text-xs px-3 py-1.5 border border-slate-200 rounded-md"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={submitDecision}
                    disabled={busy || note.trim().length < 20}
                    className={`px-3 py-1.5 rounded-md text-white text-sm font-medium disabled:opacity-50 ${
                      decisionMode === "approve" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"
                    }`}
                  >
                    {busy ? "Submitting…" : decisionMode === "approve" ? "Confirm approve" : "Confirm deny"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </aside>
      )}
    </>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">{label}</p>
      {children}
    </div>
  );
}
