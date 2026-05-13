"use client";

import { useMemo, useState } from "react";
import EmptyState from "@/components/ui/empty-state";
import { useRoomPolling, type RoomStatusRow } from "@/hooks/use-room-polling";

// Frontend status buckets for the visual filter — derived from the API status.
type DisplayBucket = "active" | "delayed" | "no_show" | "available";

function bucketOf(r: RoomStatusRow): DisplayBucket {
  if (r.status === "active" || r.status === "overstay" || r.status === "booked") return "active";
  if (r.status === "en_route" || r.status === "pending") return "delayed";
  if (r.status === "absent" || r.status === "checker_flagged") return "no_show";
  return "available";
}

const META: Record<DisplayBucket, { label: string; dot: string; gradient: string; ring: string; iconBg: string; iconColor: string; pillBg: string; pillFg: string }> = {
  active:    { label: "Active",    dot: "#10b981", gradient: "linear-gradient(135deg, #d4f7e7 0%, #ffffff 60%)", ring: "rgba(16, 185, 129, 0.25)", iconBg: "#dcfce7", iconColor: "#10b981", pillBg: "#d1fae5", pillFg: "#047857" },
  delayed:   { label: "Delayed",   dot: "#f97316", gradient: "linear-gradient(135deg, #fff1e0 0%, #ffffff 60%)", ring: "rgba(249, 115, 22, 0.25)", iconBg: "#ffedd5", iconColor: "#f97316", pillBg: "#ffedd5", pillFg: "#c2410c" },
  no_show:   { label: "No-Show",   dot: "#ef4444", gradient: "linear-gradient(135deg, #ffe4e6 0%, #ffffff 60%)", ring: "rgba(239, 68, 68, 0.25)",  iconBg: "#fee2e2", iconColor: "#ef4444", pillBg: "#fee2e2", pillFg: "#b91c1c" },
  available: { label: "Available", dot: "#cbd5e1", gradient: "linear-gradient(135deg, #f8fafc 0%, #ffffff 60%)", ring: "transparent",              iconBg: "#f1f5f9", iconColor: "#94a3b8", pillBg: "#f1f5f9", pillFg: "#64748b" },
};

export default function IFODashboard() {
  const { rooms, loading, lastUpdatedMs } = useRoomPolling();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | DisplayBucket>("all");
  const [detail, setDetail] = useState<RoomStatusRow | null>(null);
  const [forceReason, setForceReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      rooms.filter((r) => {
        const matchesSearch =
          !search ||
          r.room_code.toLowerCase().includes(search.toLowerCase()) ||
          (r.faculty_name?.toLowerCase().includes(search.toLowerCase()) ?? false);
        const matchesStatus = statusFilter === "all" || bucketOf(r) === statusFilter;
        return matchesSearch && matchesStatus;
      }),
    [rooms, search, statusFilter],
  );

  const counts = useMemo(() => {
    const c: Record<DisplayBucket, number> = { active: 0, delayed: 0, no_show: 0, available: 0 };
    for (const r of rooms) c[bucketOf(r)]++;
    return c;
  }, [rooms]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  async function forceEnd() {
    if (!detail?.current_session_id) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/apis/sessions/${detail.current_session_id}/end?force=true`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: forceReason || "IFO force-end" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message ?? data?.error ?? `HTTP ${res.status}`);
      setDetail(null);
      setForceReason("");
      showToast(`Session ended in Room ${detail.room_code}.`);
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col fade-up">
            <div className="px-4 sm:px-6 lg:px-8 grid grid-cols-2 sm:grid-cols-4 gap-3 lg:gap-4 mb-4 lg:mb-5">
        {(["active", "delayed", "no_show", "available"] as DisplayBucket[]).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter((cur) => (cur === s ? "all" : s))}
            className={`rounded-lg p-4 border text-left lift transition-all ${
              statusFilter === s ? "ring-2 ring-offset-2 ring-[#001c43]" : ""
            }`}
            style={{
              background: META[s].gradient,
              borderColor: s === "available" ? "#e2e8f0" : META[s].ring,
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <p className="text-overline" style={{ color: META[s].iconColor }}>{META[s].label}</p>
              <span className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "rgba(255,255,255,0.7)", color: META[s].iconColor }}>
                {s === "active" && (<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>)}
                {s === "delayed" && (<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>)}
                {s === "no_show" && (<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>)}
                {s === "available" && (<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12" /></svg>)}
              </span>
            </div>
            <p className="text-[28px] font-bold tracking-tight text-[#001c43] leading-none">{counts[s]}</p>
            <p className="text-[11px] text-slate-500 mt-1">rooms</p>
          </button>
        ))}
      </div>

      <div className="px-4 sm:px-6 lg:px-8 pb-6 lg:pb-8">
        <div className="card-surface overflow-hidden">
          <header className="flex items-center justify-between gap-4 px-5 lg:px-6 py-4 lg:py-5 border-b border-slate-100 flex-wrap">
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl bg-blue-50 text-[#114b9f] flex items-center justify-center">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M3 9h18M9 21V9" />
                </svg>
              </span>
              <div>
                <h2 className="text-headline text-[#001c43]">Live Floor Plan</h2>
                <p className="text-[12px] text-slate-500">
                  {rooms.length} rooms monitored · realtime + 8s poll
                  {lastUpdatedMs && (
                    <span className="text-slate-400 ml-1.5">
                      · last update {new Date(lastUpdatedMs).toLocaleTimeString()}
                    </span>
                  )}
                </p>
              </div>
            </div>
            <div className="relative">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="Search faculty or room…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full sm:w-[300px] pl-10 pr-4 py-2.5 rounded-full border border-slate-200 bg-slate-50/50 text-[13px] text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-[#114b9f] focus-ring"
              />
            </div>
          </header>

          <div className="p-4 lg:p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 lg:gap-4">
            {loading && rooms.length === 0 && Array.from({ length: 9 }).map((_, i) => <div key={i} className="rounded-lg bg-white border border-slate-200 p-4 h-36 skeleton" />)}
            {!loading && filtered.map((room, i) => (
              <button
                key={room.room_id}
                onClick={() => setDetail(room)}
                style={{ animationDelay: `${i * 25}ms` }}
                className="text-left fade-up"
              >
                <RoomCard room={room} />
              </button>
            ))}
            {!loading && filtered.length === 0 && (
              <div className="col-span-full">
                <EmptyState
                  title="No rooms match the filters"
                  body="Try clearing the search or selecting a different status."
                  action={{
                    label: "Reset filters",
                    onClick: () => { setSearch(""); setStatusFilter("all"); },
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Room detail modal */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 sm:p-6" onClick={() => setDetail(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md px-7 py-7 sm:px-8 sm:py-8" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 mb-5">
              <div>
                <h2 className="text-headline text-[#001c43]">Room {detail.room_code}</h2>
                <p className="text-[12px] text-slate-500 mt-0.5">{detail.building} · Floor {detail.floor_number}</p>
              </div>
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase"
                style={{ background: META[bucketOf(detail)].pillBg, color: META[bucketOf(detail)].pillFg }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: META[bucketOf(detail)].dot }} />
                {detail.status}
              </span>
            </div>

            {detail.faculty_name && (
              <div className="mb-3">
                <p className="text-overline mb-1">Faculty</p>
                <p className="text-[14px] font-bold text-[#001c43]">{detail.faculty_name}</p>
              </div>
            )}
            {detail.course_code && (
              <div className="mb-3">
                <p className="text-overline mb-1">Course</p>
                <p className="text-[13.5px] text-slate-700 font-medium">{detail.course_code} · {detail.modality?.toUpperCase() ?? "—"}</p>
              </div>
            )}
            {detail.en_route_eta_minutes !== undefined && detail.en_route_eta_minutes !== null && (
              <div className="rounded-xl p-3 bg-orange-50 border border-orange-200 text-[12.5px] text-orange-800 mb-3">
                Faculty is en route — ETA {detail.en_route_eta_minutes}m.
              </div>
            )}

            {detail.current_session_id ? (
              <>
                <p className="text-overline mb-2">Force end (IFO override)</p>
                <textarea
                  value={forceReason}
                  onChange={(e) => setForceReason(e.target.value)}
                  rows={2}
                  placeholder="Reason (optional but recorded for audit)"
                  className="w-full px-3.5 py-3 rounded-xl border border-slate-200 text-[13px] mb-3 resize-none"
                />
                {error && <p className="mb-4 text-[12px] text-rose-600 bg-rose-50 px-3.5 py-2.5 rounded-lg">{error}</p>}
                <div className="flex gap-3 mt-2">
                  <button onClick={() => setDetail(null)} className="flex-1 py-3 min-h-[44px] rounded-xl text-[13px] font-bold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
                    Close
                  </button>
                  <button
                    onClick={forceEnd}
                    disabled={busy}
                    className="flex-1 py-3 min-h-[44px] rounded-xl text-[13px] font-bold text-white bg-rose-500 hover:bg-rose-600 disabled:opacity-50 transition-colors"
                  >
                    {busy ? "Ending…" : "Force End Session"}
                  </button>
                </div>
              </>
            ) : (
              <button onClick={() => setDetail(null)} className="w-full py-3 min-h-[44px] rounded-xl text-[13px] font-bold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors mt-2">
                Close
              </button>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-[60] bg-[#001c43] text-white px-5 py-3 rounded-xl shadow-2xl text-[13px] font-bold flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
          {toast}
        </div>
      )}
    </div>
  );
}

function RoomCard({ room }: { room: RoomStatusRow }) {
  const b = bucketOf(room);
  const meta = META[b];
  return (
    <div
      className="relative rounded-lg border p-4 transition-all duration-200 lift overflow-hidden min-h-[160px] flex flex-col"
      style={{ background: meta.gradient, borderColor: room.status === "available" ? "#e2e8f0" : meta.ring }}
    >
      {b !== "available" && (
        <div className="absolute top-0 left-0 right-0 h-1" style={{ background: `linear-gradient(90deg, ${meta.dot} 0%, ${meta.dot}66 100%)` }} />
      )}
      <header className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-9 h-9 rounded-xl flex items-center justify-center shadow-sm" style={{ background: "white", color: meta.iconColor }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </span>
          <span className="text-[16px] font-bold text-[#001c43] tracking-tight">Room {room.room_code}</span>
        </div>
        {b !== "available" && (
          <span className="relative flex h-2 w-2 mt-1">
            <span className="absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping" style={{ background: meta.dot }} />
            <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: meta.dot }} />
          </span>
        )}
      </header>

      {b === "available" ? (
        <p className="text-[12.5px] text-slate-400 italic">Available</p>
      ) : (
        <>
          {/* Status pill — short label only. Faculty name + modality moved to body
              so long names like "Christopher Josh L. Dellosa" don't overflow. */}
          <div
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold mb-3 max-w-full"
            style={{ background: meta.pillBg, color: meta.pillFg }}
          >
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: meta.dot }} />
            <span className="truncate">
              {room.status === "active" && room.modality ? `Active · ${room.modality.toUpperCase()}` : null}
              {room.status === "active" && !room.modality ? "Active" : null}
              {room.status === "overstay" ? "Overstay" : null}
              {room.status === "en_route" && room.en_route_eta_minutes != null ? `En Route · ETA ${room.en_route_eta_minutes}m` : null}
              {room.status === "en_route" && room.en_route_eta_minutes == null ? "En Route" : null}
              {room.status === "pending" ? "Pending start" : null}
              {(room.status === "absent" || room.status === "checker_flagged") ? "No Heartbeat" : null}
              {room.status === "booked" ? "Booked" : null}
            </span>
          </div>
          <div className="space-y-1.5 text-[11.5px] text-slate-600 min-w-0">
            {room.faculty_name && (
              <Row icon="users">
                <span className="truncate" title={room.faculty_name}>{room.faculty_name}</span>
              </Row>
            )}
            {room.course_code && <Row icon="pulse">{room.course_code}</Row>}
          </div>
        </>
      )}
    </div>
  );
}

function Row({ icon, children }: { icon: "pulse" | "users"; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 text-slate-500">
      {icon === "pulse" && (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      )}
      {icon === "users" && (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
          <circle cx="9" cy="7" r="4" />
        </svg>
      )}
      <span>{children}</span>
    </div>
  );
}
