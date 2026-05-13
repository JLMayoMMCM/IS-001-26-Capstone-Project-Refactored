"use client";

import { useEffect, useState } from "react";

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
  approved: "bg-green-100 text-green-700",
  denied: "bg-red-100 text-red-700",
  escalated: "bg-purple-100 text-purple-700",
};

export default function DisputeQueuePage() {
  const [filter, setFilter] = useState<Dispute["status"] | "all">("pending");
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<Dispute | null>(null);

  async function refresh() {
    setLoading(true);
    const url = filter === "all" ? "/api/disputes" : `/api/disputes?status=${filter}`;
    const res = await fetch(url, { cache: "no-store" });
    const data = await res.json();
    setDisputes(data?.disputes ?? []);
    setLoading(false);
  }

  useEffect(() => { refresh(); }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  async function decide(id: string, action: "approve" | "deny") {
    const note = action === "deny" ? prompt("Reason for denial (min 10 characters):") : prompt("Decision note (optional):") ?? "";
    if (action === "deny" && (!note || note.trim().length < 10)) {
      alert("Denial requires a reason of at least 10 characters.");
      return;
    }
    const res = await fetch(`/api/disputes/${id}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(action === "deny" ? { decision_note: note?.trim() } : { decision_note: note ?? null }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      alert(d?.error?.message ?? "Decision failed");
      return;
    }
    setActive(null);
    refresh();
  }

  return (
    <div className="min-h-full p-8">
      <header className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">Dispute Queue</h1>
        <p className="text-sm text-slate-500 mt-0.5">Faculty attendance disputes — review by SLA urgency</p>
      </header>

      <div className="flex gap-2 mb-5 flex-wrap">
        {(["pending", "approved", "denied", "escalated", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-full text-sm font-semibold border ${
              filter === f
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
            }`}
          >
            {f === "all" ? "All" : f[0].toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-lg shadow-sm">
        {loading ? (
          <div className="p-6 space-y-3">
            <div className="h-16 skeleton" />
            <div className="h-16 skeleton" />
          </div>
        ) : disputes.length === 0 ? (
          <p className="p-10 text-center text-sm text-slate-400">No disputes match this filter.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {disputes.map((d) => {
              const slaMs = new Date(d.deadline_at).getTime() - Date.now();
              const slaHrs = Math.max(0, Math.round(slaMs / 3_600_000));
              const slaSoon = slaHrs <= 24;
              return (
                <li key={d.id}>
                  <button
                    onClick={() => setActive(d)}
                    className="w-full text-left px-5 py-4 hover:bg-slate-50 flex items-start gap-4"
                  >
                    <span className={`text-xs px-2.5 py-1 rounded-full font-semibold shrink-0 ${STATUS_BADGE[d.status]}`}>
                      {d.status}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-900 truncate">
                        {d.faculty?.full_name ?? "Unknown faculty"} · {d.session?.schedule?.course_code ?? "—"}
                      </p>
                      <p className="text-xs text-slate-500 truncate">{d.explanation}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Filed {new Date(d.filed_at).toLocaleString()} · Reason: {d.reason_category.replace("_", " ")}
                        {d.source === "hr_flag" && <span className="ml-2 px-1.5 rounded bg-amber-100 text-amber-700 font-semibold">HR Flagged</span>}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-xs font-bold ${slaSoon ? "text-red-600" : "text-slate-500"}`}>
                        SLA: {slaHrs}h
                      </p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Detail panel */}
      {active && (
        <aside className="fixed inset-y-0 right-0 w-96 bg-white shadow-2xl z-40 border-l border-slate-200 overflow-y-auto">
          <header className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3 sticky top-0 bg-white">
            <div>
              <p className="text-base font-bold text-slate-900">Dispute Detail</p>
              <p className="text-xs text-slate-400">{active.id}</p>
            </div>
            <button onClick={() => setActive(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">✕</button>
          </header>
          <div className="px-5 py-4 space-y-4">
            <Section label="Faculty">
              <p className="text-sm font-semibold text-slate-900">{active.faculty?.full_name ?? "—"}</p>
              <p className="text-xs text-slate-500">{active.faculty?.email}</p>
            </Section>
            <Section label="Session">
              <p className="text-sm text-slate-700">
                {active.session?.schedule?.course_code} — {active.session?.schedule?.course_name}
              </p>
              <p className="text-xs text-slate-500">
                Room {active.session?.room?.room_code} · {active.session?.session_date} · {active.session?.status}
              </p>
            </Section>
            <Section label="Reason">
              <p className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700 inline-block">
                {active.reason_category.replace("_", " ")}
              </p>
            </Section>
            <Section label="Explanation">
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{active.explanation}</p>
            </Section>
            <Section label="Decision">
              <p className="text-sm text-slate-700">{active.decision_note ?? <span className="text-slate-400">No note yet</span>}</p>
              {active.reviewed_at && <p className="text-xs text-slate-400 mt-1">Reviewed {new Date(active.reviewed_at).toLocaleString()}</p>}
            </Section>

            {active.status === "pending" && (
              <div className="flex gap-2 pt-2 sticky bottom-0 bg-white">
                <button
                  onClick={() => decide(active.id, "deny")}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold border border-red-200 text-red-700 bg-red-50 hover:bg-red-100"
                >
                  Deny
                </button>
                <button
                  onClick={() => decide(active.id, "approve")}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white"
                  style={{ background: "#16a34a" }}
                >
                  Approve
                </button>
              </div>
            )}
          </div>
        </aside>
      )}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">{label}</p>
      {children}
    </div>
  );
}
