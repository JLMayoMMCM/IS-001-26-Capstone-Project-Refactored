"use client";

import { useMemo, useState } from "react";
import { useRoomPolling, type RoomStatusRow } from "@/hooks/use-room-polling";
import { useAssistFeed, type AssistRequest } from "@/hooks/use-assist-feed";

type Modality = "f2f" | "blended" | "online";

const RESOLUTION_OPTIONS = [
  { value: "resolved_onsite",    label: "Resolved on-site" },
  { value: "referred_ifo",       label: "Referred to IFO" },
  { value: "referred_external",  label: "Referred external" },
  { value: "no_issue",           label: "No issue found" },
  { value: "other",              label: "Other" },
] as const;

const GUARD_FLOOR = 2;

function statusDot(status: RoomStatusRow["status"]) {
  if (status === "active") return "bg-emerald-500";
  if (status === "en_route") return "bg-orange-400";
  if (status === "absent" || status === "checker_flagged" || status === "overstay") return "bg-rose-500";
  if (status === "booked") return "bg-violet-500";
  return "bg-slate-300";
}
function statusText(status: RoomStatusRow["status"]) {
  if (status === "active") return "Active";
  if (status === "en_route") return "En Route";
  if (status === "absent" || status === "checker_flagged") return "No Heartbeat";
  if (status === "overstay") return "Overstay";
  if (status === "booked") return "Booked";
  return "Available";
}
function statusTextColor(status: RoomStatusRow["status"]) {
  if (status === "active") return "text-emerald-700";
  if (status === "en_route") return "text-orange-700";
  if (status === "absent" || status === "checker_flagged" || status === "overstay") return "text-rose-700";
  if (status === "booked") return "text-violet-700";
  return "text-slate-500";
}

function ModalityBadge({ m }: { m?: Modality | null }) {
  if (!m) return null;
  if (m === "f2f") return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold">F2F</span>;
  if (m === "blended") return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-800 font-bold">Hybrid</span>;
  return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-cyan-100 text-cyan-800 font-bold">Online</span>;
}

export default function GuardDashboard() {
  const { rooms, loading: roomsLoading } = useRoomPolling();
  const { items: assists, loading: assistsLoading, refresh: refreshAssists } = useAssistFeed();
  // IDs the user has clicked Acknowledge on locally — used so the UI flips
  // immediately without waiting for the realtime/refresh round trip. If the
  // request fails we drop the ID and surface the error so the row reappears.
  const [optimisticAcked, setOptimisticAcked] = useState<Set<string>>(new Set());

  const [activeTab, setActiveTab] = useState<"rooms" | "notifications">("rooms");
  const [logFor, setLogFor] = useState<AssistRequest | null>(null);
  const [logNote, setLogNote] = useState("");
  const [logResolution, setLogResolution] = useState<typeof RESOLUTION_OPTIONS[number]["value"] | "">("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const floorRooms = useMemo(
    () => rooms.filter((r) => r.floor_number === GUARD_FLOOR).sort((a, b) => a.room_code.localeCompare(b.room_code)),
    [rooms],
  );

  const unack = useMemo(
    () => assists.filter((a) => !a.guard_acknowledged_at && !optimisticAcked.has(a.id)),
    [assists, optimisticAcked],
  );

  function showToast(m: string) { setToast(m); setTimeout(() => setToast(null), 2500); }

  function openLog(a: AssistRequest) {
    setLogFor(a);
    setLogNote("");
    setLogResolution("");
    setError(null);
  }

  async function quickAck(id: string) {
    // Optimistic: hide from unack list immediately
    setOptimisticAcked((cur) => new Set(cur).add(id));
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/assists/${id}/acknowledge`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source: "guard" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message ?? data?.error ?? `HTTP ${res.status}`);
      await refreshAssists();
      showToast("Acknowledged.");
    } catch (e) {
      // Roll back optimistic ack so the row reappears in unack
      setOptimisticAcked((cur) => {
        const next = new Set(cur);
        next.delete(id);
        return next;
      });
      setError(String((e as Error).message));
    } finally {
      setBusyId(null);
    }
  }

  async function submitLog() {
    if (!logFor) return;
    setBusyId(logFor.id);
    setError(null);
    try {
      const res = await fetch(`/api/assists/${logFor.id}/acknowledge`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source: "guard",
          incident_note: logNote.trim() || undefined,
          resolution_status: logResolution || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message ?? data?.error ?? `HTTP ${res.status}`);
      await refreshAssists();
      setLogFor(null);
      showToast("Incident log submitted.");
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusyId(null);
    }
  }

  function skipLog() {
    setLogFor(null);
  }

  return (
    <div className="flex-1 flex flex-col fade-up bg-slate-50 min-h-0">
      {/* Tab bar */}
      <div className="bg-white border-b border-slate-200 px-4 pt-3 sticky top-0 z-10">
        <div className="flex gap-1">
          {(["rooms", "notifications"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-bold rounded-t-lg transition-colors capitalize ${
                activeTab === tab ? "bg-blue-600 text-white" : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
              }`}
            >
              {tab === "rooms" ? "Room Status" : "Assist Feed"}
              {tab === "notifications" && unack.length > 0 && (
                <span className="ml-1.5 text-[10px] bg-rose-500 text-white px-1.5 py-0.5 rounded-full">
                  {unack.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Room Status */}
      {activeTab === "rooms" && (
        <div className="p-4 flex-1 min-h-0 overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-[#001c43]">Floor {GUARD_FLOOR} — Room Status</h2>
            <span className="text-[11px] px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 font-bold">View Only</span>
          </div>
          {roomsLoading && floorRooms.length === 0 ? (
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-32 skeleton rounded-xl" />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {floorRooms.map((room) => (
                <div
                  key={room.room_id}
                  className={`bg-white border rounded-xl shadow-sm p-3 ${
                    room.status === "absent" || room.status === "checker_flagged" || room.status === "overstay"
                      ? "border-rose-200" : "border-slate-200"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-2xl font-bold text-[#001c43]">{room.room_code}</span>
                    <div className={`w-2 h-2 rounded-full ${statusDot(room.status)} shrink-0 ${room.status === "active" ? "ambient-pulse" : ""}`} />
                  </div>
                  <p className={`text-xs font-bold ${statusTextColor(room.status)} mb-1`}>
                    {statusText(room.status)}
                    {room.status === "en_route" && room.en_route_eta_minutes != null && ` — ETA ${room.en_route_eta_minutes}m`}
                  </p>
                  {room.faculty_name && (
                    <p className="text-xs text-slate-700 font-bold truncate">{room.faculty_name}</p>
                  )}
                  {room.course_code && (
                    <p className="text-xs text-slate-500 truncate">{room.course_code}</p>
                  )}
                  {room.modality && (
                    <div className="mt-1"><ModalityBadge m={room.modality} /></div>
                  )}
                </div>
              ))}
              {floorRooms.length === 0 && (
                <p className="col-span-2 text-center text-sm text-slate-400 py-12">
                  No rooms on Floor {GUARD_FLOOR}.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Assist Feed */}
      {activeTab === "notifications" && (
        <div className="p-4 space-y-3 flex-1 min-h-0 overflow-y-auto">
          <h2 className="text-base font-bold text-[#001c43] mb-1">Assist Feed</h2>
          <p className="text-xs text-slate-500 mb-2">{unack.length} unacknowledged · live updates</p>

          {error && (
            <div className="px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-[12px] text-rose-700 font-bold">
              {error}
            </div>
          )}

          {assistsLoading && assists.length === 0 ? (
            <div className="space-y-3">
              <div className="h-24 skeleton rounded-xl" />
              <div className="h-24 skeleton rounded-xl" />
            </div>
          ) : assists.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-400">No assist requests.</p>
          ) : (
            assists.map((a) => {
              const isUnack = !a.guard_acknowledged_at;
              const isResolved = !!a.guard_incident_logged_at;
              return (
                <div
                  key={a.id}
                  className={`bg-white border rounded-xl shadow-sm overflow-hidden ${
                    isUnack ? "border-l-4 border-l-rose-400 border-y border-r border-slate-200" : "border-slate-200"
                  }`}
                >
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10.5px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-bold uppercase">
                          Assist
                        </span>
                        {a.escalated_at && (
                          <span className="text-[10.5px] px-2 py-0.5 rounded-full bg-rose-600 text-white font-bold animate-pulse">
                            ESCALATED
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-400 whitespace-nowrap shrink-0">
                        {new Date(a.sent_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <p className="text-sm font-bold text-[#001c43]">
                      Room {a.room?.room_code ?? "?"} — Floor {a.room?.floor_number ?? "?"}
                    </p>
                    <p className="text-xs text-slate-600">{a.faculty?.full_name ?? "Unknown faculty"}</p>
                    {a.note && <p className="text-xs text-slate-500 mt-1 italic">&ldquo;{a.note}&rdquo;</p>}
                    <div className="flex gap-1 flex-wrap mt-1.5">
                      {a.assist_types.split(",").map((t) => (
                        <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-bold">
                          {t.trim()}
                        </span>
                      ))}
                    </div>

                    {isUnack && (
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => quickAck(a.id)}
                          disabled={busyId === a.id}
                          className="flex-1 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-bold hover:bg-slate-700 disabled:opacity-50"
                        >
                          {busyId === a.id ? "…" : "Acknowledge"}
                        </button>
                        <button
                          onClick={() => openLog(a)}
                          className="flex-1 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-bold hover:bg-blue-700"
                        >
                          + Log
                        </button>
                      </div>
                    )}
                    {!isUnack && !isResolved && (
                      <p className="mt-2 text-xs text-emerald-700 font-bold">
                        ✓ Acknowledged · awaiting incident log
                      </p>
                    )}
                    {isResolved && (
                      <div className="mt-2">
                        <p className="text-xs text-emerald-700 font-bold">✓ Resolved</p>
                        <p className="text-[11px] text-slate-500">
                          {a.guard_resolution_status?.replace("_", " ")}
                          {a.guard_incident_note ? ` — ${a.guard_incident_note}` : ""}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Incident log modal */}
      {logFor && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4" onClick={skipLog}>
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-[#001c43] mb-1">Incident Log</h3>
            <p className="text-xs text-slate-500 mb-4">
              Room {logFor.room?.room_code} — {logFor.faculty?.full_name}
            </p>

            <div className="mb-3">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">
                Note (optional)
              </label>
              <textarea
                value={logNote}
                onChange={(e) => setLogNote(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="Describe what you observed…"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <p className="text-[11px] text-slate-400 text-right mt-0.5">{logNote.length}/500</p>
            </div>

            <div className="mb-4">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">
                Resolution
              </label>
              <select
                value={logResolution}
                onChange={(e) => setLogResolution(e.target.value as typeof logResolution)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                <option value="">Select resolution…</option>
                {RESOLUTION_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>

            {error && <p className="mb-3 text-[12px] text-rose-600 bg-rose-50 px-3 py-2 rounded-lg">{error}</p>}

            <div className="flex gap-2">
              <button onClick={skipLog} className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 text-slate-700 text-sm font-bold">
                Skip
              </button>
              <button
                onClick={submitLog}
                disabled={busyId === logFor.id}
                className="flex-1 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-50"
              >
                {busyId === logFor.id ? "Submitting…" : "Submit Log"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-20 right-4 z-[60] bg-[#001c43] text-white px-4 py-2.5 rounded-xl shadow-2xl text-[12.5px] font-bold flex items-center gap-2">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
          {toast}
        </div>
      )}
    </div>
  );
}
