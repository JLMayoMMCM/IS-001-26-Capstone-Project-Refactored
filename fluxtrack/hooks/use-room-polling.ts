"use client";

import { useEffect, useRef, useState } from "react";

export type RoomStatusRow = {
  id: string;
  room_id: string; // alias of id for legacy callsites
  room_code: string;
  building: string;
  floor_number: number;
  room_type: string;
  capacity: number | null;
  status:
    | "available"
    | "active"
    | "en_route"
    | "pending"
    | "absent"
    | "overstay"
    | "checker_flagged"
    | "booked";
  current_session_id: string | null;
  current_faculty_name: string | null;
  current_course_code: string | null;
  faculty_name: string | null;
  course_code: string | null;
  modality: "f2f" | "blended" | "online" | null;
  en_route_eta_minutes: number | null;
  scheduled_end: string | null;
  end_time_iso: string | null;
};

const POLL_MS = 8000;

export function useRoomPolling(floorFilter?: number) {
  const [rooms, setRooms] = useState<RoomStatusRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedMs, setLastUpdatedMs] = useState<number>(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      try {
        const url = floorFilter
          ? `/apis/rooms/status?floor=${floorFilter}`
          : "/apis/rooms/status";
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { rooms: RoomStatusRow[] };
        if (cancelled) return;
        setRooms(json.rooms ?? []);
        setError(null);
        setLastUpdatedMs(Date.now());
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    tick();
    timer.current = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      if (timer.current) clearInterval(timer.current);
    };
  }, [floorFilter]);

  return { rooms, loading, error, lastUpdatedMs };
}
