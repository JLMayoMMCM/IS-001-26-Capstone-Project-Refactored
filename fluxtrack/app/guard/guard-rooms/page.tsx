"use client";

import { useRoomPolling } from "@/hooks/use-room-polling";

const STATUS_DOT: Record<string, string> = {
  active: "bg-green-500",
  pending: "bg-yellow-500",
  en_route: "bg-orange-500",
  overstay: "bg-red-500 animate-pulse",
  absent: "bg-red-500",
  available: "bg-slate-400",
  booked: "bg-purple-500",
  scheduled: "bg-slate-400",
  completed: "bg-green-700",
  early_end: "bg-orange-700",
  checker_flagged: "bg-red-700",
};

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  pending: "Pending",
  en_route: "En Route",
  overstay: "Overstay",
  absent: "Absent",
  available: "Available",
  booked: "Booked",
  scheduled: "Scheduled",
  completed: "Completed",
  early_end: "Early End",
  checker_flagged: "Flagged",
};

export default function GuardRoomsPage() {
  const { rooms, loading, lastUpdatedMs } = useRoomPolling();

  return (
    <div className="min-h-full p-3 pb-20">
      <header className="px-2 mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Room Status</h1>
          <p className="text-xs text-slate-500 mt-0.5">Read-only · {rooms.length} rooms monitored</p>
        </div>
        <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 font-semibold whitespace-nowrap">
          View Only
        </span>
      </header>

      {loading ? (
        <div className="grid grid-cols-2 gap-2 px-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 skeleton rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 px-1">
            {rooms.map((r) => {
              const dot = STATUS_DOT[r.status] ?? "bg-slate-300";
              return (
                <div
                  key={r.room_id}
                  className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm"
                >
                  <div className="flex items-start justify-between mb-1">
                    <p className="text-xl font-black text-slate-900">{r.room_code}</p>
                    <span className={`w-2.5 h-2.5 rounded-full mt-2 ${dot}`} />
                  </div>
                  <p className="text-xs text-slate-500 capitalize mb-1">
                    {STATUS_LABEL[r.status] ?? r.status}
                  </p>
                  {r.faculty_name && (
                    <p className="text-xs text-slate-700 truncate font-medium">{r.faculty_name}</p>
                  )}
                  {r.course_code && (
                    <p className="text-xs text-slate-400 truncate">{r.course_code}</p>
                  )}
                  {r.end_time_iso && (
                    <p className="text-xs text-slate-400 mt-1">
                      Ends {new Date(r.end_time_iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {lastUpdatedMs && (
            <p className="text-xs text-center text-slate-400 mt-4">
              Updated {Math.round((Date.now() - lastUpdatedMs) / 1000)}s ago · refreshes every 8s
            </p>
          )}
        </>
      )}
    </div>
  );
}
