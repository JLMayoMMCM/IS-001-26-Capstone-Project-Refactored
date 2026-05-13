"use client";

import { useEffect, useState } from "react";
import { useNotifications } from "@/hooks/use-notifications";

type Assist = {
  id: string;
  assist_types: string;
  note: string | null;
  sent_at: string;
  guard_acknowledged_at: string | null;
  guard_incident_note: string | null;
  guard_resolution_status: string | null;
  faculty: { full_name: string } | null;
  room: { room_code: string; floor_number: number } | null;
};

const RESOLUTION_OPTIONS = [
  { value: "resolved_onsite",   label: "Resolved on-site" },
  { value: "referred_ifo",      label: "Referred to IFO" },
  { value: "referred_external", label: "Referred to external" },
  { value: "no_issue",          label: "No issue found" },
  { value: "other",             label: "Other" },
];

export default function GuardNotificationsPage() {
  // In-app notifications (welcome, etc.)
  const { items: notifs, unreadCount, markRead } = useNotifications({ realtime: true });

  // Assist requests on this guard's floor (live via Realtime via the hook)
  const [assists, setAssists] = useState<Assist[]>([]);
  const [loading, setLoading] = useState(true);
  const [logging, setLogging] = useState<string | null>(null); // assist id being logged
  const [logNote, setLogNote] = useState("");
  const [logResolution, setLogResolution] = useState("resolved_onsite");

  async function refreshAssists() {
    setLoading(true);
    const res = await fetch("/api/assists", { cache: "no-store" });
    const data = await res.json();
    setAssists(data?.assists ?? []);
    setLoading(false);
  }

  useEffect(() => { refreshAssists(); }, []);

  async function ack(id: string) {
    setLogging(id);
    setLogNote("");
    setLogResolution("resolved_onsite");
  }

  async function submitIncident(id: string, skip = false) {
    const body: Record<string, unknown> = { source: "guard" };
    if (!skip) {
      if (logNote.trim().length > 500) {
        alert("Note must be at most 500 characters");
        return;
      }
      body.incident_note = logNote.trim() || undefined;
      body.resolution_status = logResolution;
    }
    const res = await fetch(`/api/assists/${id}/acknowledge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      alert(d?.error?.message ?? "Failed");
      return;
    }
    setLogging(null);
    refreshAssists();
  }

  return (
    <div className="min-h-full p-3 pb-20">
      <header className="px-2 mb-4">
        <h1 className="text-lg font-bold text-slate-900">Notifications</h1>
        <p className="text-xs text-slate-500">{unreadCount} unread · live updates enabled</p>
      </header>

      {/* Assist requests section */}
      <section className="mb-5 px-1">
        <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 px-1">Assist Requests</h2>
        {loading ? (
          <div className="h-20 skeleton rounded-xl" />
        ) : assists.length === 0 ? (
          <p className="text-xs text-slate-400 px-2 py-3">No assist requests.</p>
        ) : (
          assists.map((a) => {
            const acked = !!a.guard_acknowledged_at;
            const showLog = logging === a.id;
            return (
              <div
                key={a.id}
                className={`bg-white border rounded-xl p-3 mb-2 ${
                  acked ? "border-slate-200" : "border-l-4 border-red-400 border-y border-r border-slate-200"
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div>
                    <p className="text-sm font-bold text-slate-900">
                      Room {a.room?.room_code ?? "?"} · Floor {a.room?.floor_number ?? "?"}
                    </p>
                    <p className="text-xs text-slate-500">{a.faculty?.full_name ?? "Unknown faculty"}</p>
                  </div>
                  <span className="text-xs text-slate-400 shrink-0">
                    {new Date(a.sent_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <div className="flex gap-1 flex-wrap mb-2">
                  {a.assist_types.split(",").map((t) => (
                    <span key={t} className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
                      {t.trim()}
                    </span>
                  ))}
                </div>
                {a.note && <p className="text-xs text-slate-700 mb-2">{a.note}</p>}

                {!acked && !showLog && (
                  <button
                    onClick={() => ack(a.id)}
                    className="w-full mt-1 py-2 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-700"
                  >
                    Acknowledge
                  </button>
                )}

                {showLog && (
                  <div className="space-y-2 mt-2 bg-slate-50 rounded-lg p-3 border border-slate-200">
                    <p className="text-xs font-semibold text-slate-700">Log incident (optional)</p>
                    <textarea
                      value={logNote}
                      onChange={(e) => setLogNote(e.target.value)}
                      maxLength={500}
                      rows={2}
                      placeholder="Brief incident note (max 500 chars)…"
                      className="w-full px-2.5 py-2 rounded-lg border border-slate-200 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <select
                      value={logResolution}
                      onChange={(e) => setLogResolution(e.target.value)}
                      className="w-full px-2.5 py-2 rounded-lg border border-slate-200 text-xs bg-white"
                    >
                      {RESOLUTION_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    <div className="flex gap-2">
                      <button
                        onClick={() => submitIncident(a.id, true)}
                        className="flex-1 py-2 rounded-lg text-xs font-semibold text-slate-600 bg-white border border-slate-200"
                      >
                        Skip
                      </button>
                      <button
                        onClick={() => submitIncident(a.id)}
                        className="flex-1 py-2 rounded-lg text-xs font-bold text-white bg-blue-600"
                      >
                        Submit Log
                      </button>
                    </div>
                  </div>
                )}

                {acked && (
                  <p className="text-xs text-green-600 font-semibold mt-1">
                    ✓ Acknowledged
                    {a.guard_resolution_status && ` · ${a.guard_resolution_status.replace("_", " ")}`}
                  </p>
                )}
              </div>
            );
          })
        )}
      </section>

      {/* In-app feed */}
      <section className="px-1">
        <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 px-1">System Feed</h2>
        {notifs.length === 0 ? (
          <p className="text-xs text-slate-400 px-2 py-3">No system notifications.</p>
        ) : (
          notifs.map((n) => (
            <div
              key={n.id}
              className={`bg-white border rounded-xl p-3 mb-2 ${
                n.read_at ? "border-slate-200 opacity-70" : "border-blue-200 bg-blue-50/30"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-900">{n.title}</p>
                  <p className="text-xs text-slate-600 mt-0.5">{n.body}</p>
                </div>
                <span className="text-xs text-slate-400 shrink-0">
                  {new Date(n.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              {!n.read_at && (
                <button
                  onClick={() => markRead(n.id)}
                  className="text-xs text-blue-600 font-semibold mt-1 hover:underline"
                >
                  Mark read
                </button>
              )}
            </div>
          ))
        )}
      </section>
    </div>
  );
}
