"use client";

import { useMemo, useState } from "react";
import EmptyState from "@/components/ui/empty-state";
import { ROOMS, getBuildings, roomsByBuilding, type RoomBuilding, type RoomRecord } from "@/lib/data/rooms";

const BUILDING_BADGE: Record<RoomBuilding, string> = {
  "Admin Building":     "bg-blue-100 text-blue-700",
  "Education Building": "bg-emerald-100 text-emerald-700",
  Gymnasium:            "bg-amber-100 text-amber-700",
  Virtual:              "bg-purple-100 text-purple-700",
  Other:                "bg-slate-100 text-slate-700",
};

const TYPE_TONE: Record<string, string> = {
  Lecture: "bg-slate-100 text-slate-700",
  Laboratory: "bg-indigo-50 text-indigo-700",
  Office: "bg-rose-50 text-rose-700",
};

function typeBadge(t: string): string {
  return TYPE_TONE[t] ?? "bg-slate-100 text-slate-600";
}

export default function IFORoomsPage() {
  const [building, setBuilding] = useState<RoomBuilding | "all">("all");
  const [search, setSearch] = useState("");
  const [includeVirtual, setIncludeVirtual] = useState(true);

  const grouped = useMemo(() => roomsByBuilding(), []);
  const buildings = useMemo(() => getBuildings(false), []);

  const filtered = useMemo(() => {
    let list = ROOMS;
    if (!includeVirtual) list = list.filter((r) => r.building !== "Virtual");
    if (building !== "all") list = list.filter((r) => r.building === building);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (r) =>
          r.room_no.toLowerCase().includes(q) ||
          r.room_name.toLowerCase().includes(q) ||
          r.room_type.toLowerCase().includes(q) ||
          r.caretaker.toLowerCase().includes(q)
      );
    }
    return list;
  }, [building, search, includeVirtual]);

  const filteredByBuilding = useMemo(() => {
    const acc: Partial<Record<RoomBuilding, RoomRecord[]>> = {};
    for (const r of filtered) (acc[r.building] ||= []).push(r);
    return acc;
  }, [filtered]);

  return (
    <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Room Map</h1>
          <p className="text-sm text-slate-500">
            MMCM rooms grouped by building. {ROOMS.length} rooms · {buildings.length} buildings.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <label className="text-xs flex items-center gap-1">
            <input
              type="checkbox"
              checked={includeVirtual}
              onChange={(e) => setIncludeVirtual(e.target.checked)}
            />
            Include virtual rooms
          </label>
        </div>
      </header>

      {/* Building chips */}
      <section className="flex flex-wrap gap-2 items-center">
        <Chip active={building === "all"} onClick={() => setBuilding("all")}>
          All ({ROOMS.length})
        </Chip>
        {buildings.map((b) => {
          if (!includeVirtual && b === "Virtual") return null;
          const count = grouped[b].length;
          if (count === 0) return null;
          return (
            <Chip key={b} active={building === b} onClick={() => setBuilding(b)}>
              {b} ({count})
            </Chip>
          );
        })}
        <input
          className="ml-auto flex-1 min-w-48 text-sm border border-slate-200 rounded-md px-2 py-1.5"
          placeholder="Search code / name / type / caretaker…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </section>

      {filtered.length === 0 ? (
        <EmptyState
          title="No rooms match"
          description="Try removing a filter or clearing the search query."
        />
      ) : (
        buildings.map((b) => {
          if (!includeVirtual && b === "Virtual") return null;
          const rows = filteredByBuilding[b];
          if (!rows || rows.length === 0) return null;
          return (
            <section key={b} className="space-y-2">
              <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <span className={`inline-block w-2 h-2 rounded-full ${BUILDING_BADGE[b].split(" ")[0]}`} />
                {b}
                <span className="text-xs text-slate-500">({rows.length})</span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                {rows.map((r) => (
                  <RoomCard key={r.room_no} room={r} />
                ))}
              </div>
            </section>
          );
        })
      )}
    </main>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-xs ${
        active ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}

function RoomCard({ room }: { room: RoomRecord }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3 flex flex-col gap-1.5 hover:border-slate-300 transition">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-sm font-semibold text-slate-900">{room.room_no}</span>
        {room.room_type && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${typeBadge(room.room_type)}`}>
            {room.room_type}
          </span>
        )}
      </div>
      <div className="text-xs text-slate-700 line-clamp-2 min-h-[2.25rem]">
        {room.room_name || <span className="text-slate-400 italic">unnamed</span>}
      </div>
      <div className="flex items-center justify-between text-[10px] text-slate-500">
        <span>
          {room.capacity && room.capacity > 0 ? `Cap. ${room.capacity}` : "—"}
        </span>
        <span className="font-mono">{room.caretaker || "—"}</span>
      </div>
    </div>
  );
}
