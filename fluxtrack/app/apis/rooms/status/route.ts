import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { handle, ApiError } from "@/lib/api/errors";
import { getCurrentUser } from "@/lib/auth/get-session";
import { todayLocal } from "@/lib/utils/date";

/**
 * GET /api/rooms/status — IFO Live Map polling endpoint (NFR-02: 8s poll, p95 < 500ms).
 *
 * Returns one row per active room with derived status, picking the
 * "most-active" event currently affecting it:
 *   1. Active manual booking (purple)        — highest priority overlay
 *   2. Active session today (active/overstay/en_route)
 *   3. En-route declaration (orange) on a not-yet-started session
 *   4. Available (gray)
 */
export const GET = handle(async () => {
  await getCurrentUser();
  const supabase = await createClient();

  const today = todayLocal();
  const nowIso = new Date().toISOString();

  // Pull only what we need — three small queries are cheaper than a single
  // JOIN with optional fields when we already have the room list cached.
  const [roomsRes, sessionsRes, bookingsRes, enRouteRes] = await Promise.all([
    supabase
      .from("rooms")
      .select("id, room_code, building, floor_number")
      .eq("is_active", true),
    supabase
      .from("sessions")
      .select(
        `id, room_id, status, actual_modality, actual_start, faculty_id,
         schedule:schedules(course_code, end_time),
         faculty:users!sessions_faculty_id_fkey(full_name)`,
      )
      .eq("session_date", today)
      .in("status", ["active", "overstay", "pending", "en_route"]),
    supabase
      .from("manual_bookings")
      .select("id, room_id, occupant_name, end_datetime")
      .eq("status", "active")
      .lte("start_datetime", nowIso)
      .gt("end_datetime", nowIso),
    supabase
      .from("en_route_declarations")
      .select("id, session_id, eta_minutes, hold_expires_at, session:sessions(room_id)")
      .eq("status", "active")
      .gt("hold_expires_at", nowIso),
  ]);

  if (roomsRes.error) throw new ApiError("INTERNAL", roomsRes.error.message);

  type SessionRow = {
    id: string;
    room_id: string;
    status: string;
    actual_modality: string | null;
    actual_start: string | null;
    schedule: { course_code: string; end_time: string } | null;
    faculty: { full_name: string } | null;
  };
  type BookingRow = { id: string; room_id: string; occupant_name: string; end_datetime: string };
  type EnRouteRow = {
    id: string;
    session_id: string;
    eta_minutes: number;
    hold_expires_at: string;
    session: { room_id: string } | null;
  };

  const sessionsByRoom = new Map<string, SessionRow>();
  for (const s of ((sessionsRes.data ?? []) as unknown as SessionRow[])) sessionsByRoom.set(s.room_id, s);

  const bookingsByRoom = new Map<string, BookingRow>();
  for (const b of ((bookingsRes.data ?? []) as unknown as BookingRow[])) bookingsByRoom.set(b.room_id, b);

  const enRouteByRoom = new Map<string, EnRouteRow>();
  for (const e of ((enRouteRes.data ?? []) as unknown as EnRouteRow[])) {
    if (e.session?.room_id) enRouteByRoom.set(e.session.room_id, e);
  }

  const rows = (roomsRes.data ?? []).map((r) => {
    const booking = bookingsByRoom.get(r.id);
    if (booking) {
      return {
        room_id: r.id,
        room_code: r.room_code,
        building: r.building,
        floor_number: r.floor_number,
        status: "booked" as const,
        occupant: booking.occupant_name,
        end_time_iso: booking.end_datetime,
      };
    }

    const session = sessionsByRoom.get(r.id);
    if (session) {
      return {
        room_id: r.id,
        room_code: r.room_code,
        building: r.building,
        floor_number: r.floor_number,
        status: session.status as "active" | "overstay" | "pending" | "en_route",
        current_session_id: session.id,
        faculty_name: session.faculty?.full_name ?? null,
        course_code: session.schedule?.course_code ?? null,
        modality: session.actual_modality,
        end_time: session.schedule?.end_time ?? null,
        actual_start: session.actual_start,
      };
    }

    const enRoute = enRouteByRoom.get(r.id);
    if (enRoute) {
      const etaRemaining = Math.round((new Date(enRoute.hold_expires_at).getTime() - Date.now()) / 60000);
      return {
        room_id: r.id,
        room_code: r.room_code,
        building: r.building,
        floor_number: r.floor_number,
        status: "en_route" as const,
        en_route_eta_minutes: Math.max(0, etaRemaining),
      };
    }

    return {
      room_id: r.id,
      room_code: r.room_code,
      building: r.building,
      floor_number: r.floor_number,
      status: "available" as const,
    };
  });

  return NextResponse.json(
    { rooms: rows, ts: nowIso },
    { headers: { "Cache-Control": "no-store" } },
  );
});
