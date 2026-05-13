// Typed access to the MMCM rooms catalog (parsed from
// replication/format/2T-25-26-Rooms.xlsx via scripts/parse-rooms.cjs).

import raw from "./rooms.generated.json";

export type RoomBuilding = "Admin Building" | "Education Building" | "Gymnasium" | "Virtual" | "Other";

export type RoomRecord = {
  room_no: string;
  capacity: number | null;
  room_type: string;
  room_name: string;
  caretaker: string;
  building: RoomBuilding;
};

// User-defined categorization rule (from spec):
//   1st building (Admin Building) → A* rooms
//   2nd building (Education Building) → R* rooms
//   3rd building (Gymnasium) → GYM* + P* rooms
// V* rooms (virtual / online) and U* rooms (UTM) are grouped separately.
function bucket(room_no: string): RoomBuilding {
  const code = room_no.toUpperCase();
  if (code.startsWith("GYM") || code.startsWith("P")) return "Gymnasium";
  if (code.startsWith("A")) return "Admin Building";
  if (code.startsWith("R")) return "Education Building";
  if (code.startsWith("V")) return "Virtual";
  return "Other";
}

type RawRow = { room_no: string; capacity: string; room_type: string; room_name: string; caretaker: string };

export const ROOMS: RoomRecord[] = (raw as RawRow[])
  .filter((r) => r.room_no && r.room_no.trim().length > 0)
  .map((r) => ({
    room_no: r.room_no.trim(),
    capacity: r.capacity ? Number(r.capacity) : null,
    room_type: r.room_type ?? "",
    room_name: (r.room_name ?? "").trim(),
    caretaker: (r.caretaker ?? "").trim(),
    building: bucket(r.room_no),
  }));

// Ordered list of buildings for the room-map UI. "Other" is suppressed by
// default (one stray U* room in this catalog); call `getBuildings(true)` to
// include it.
const BUILDING_ORDER: RoomBuilding[] = [
  "Admin Building",
  "Education Building",
  "Gymnasium",
  "Virtual",
  "Other",
];

export function getBuildings(includeOther = false): RoomBuilding[] {
  return BUILDING_ORDER.filter((b) => includeOther || b !== "Other");
}

export function roomsByBuilding(): Record<RoomBuilding, RoomRecord[]> {
  const out: Record<RoomBuilding, RoomRecord[]> = {
    "Admin Building": [],
    "Education Building": [],
    Gymnasium: [],
    Virtual: [],
    Other: [],
  };
  for (const r of ROOMS) out[r.building].push(r);
  // Sort each bucket by room number (natural-ish — alpha then numeric).
  for (const key of Object.keys(out) as RoomBuilding[]) {
    out[key].sort((a, b) => a.room_no.localeCompare(b.room_no, "en", { numeric: true }));
  }
  return out;
}
