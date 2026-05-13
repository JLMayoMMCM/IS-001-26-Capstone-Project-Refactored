import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { handle, ApiError } from "@/lib/api/errors";
import { requireRole } from "@/lib/auth/get-session";
import { auditLog, getClientIp } from "@/lib/audit/log";

type BookingBody = {
  room_id: string;
  occupant_name: string;
  purpose?: string;
  start_datetime: string; // ISO
  end_datetime: string;   // ISO
  contact_info?: string;
};

export const GET = handle(async (req) => {
  await requireRole("ifo_admin", "system_admin", "hr_admin");
  const url = new URL(req.url);
  const roomId = url.searchParams.get("room_id");

  const supabase = await createClient();
  let q = supabase
    .from("manual_bookings")
    .select("*, room:rooms(room_code, building, floor_number)")
    .eq("status", "active")
    .order("start_datetime");
  if (roomId) q = q.eq("room_id", roomId);

  const { data, error } = await q;
  if (error) throw new ApiError("INTERNAL", error.message);
  return NextResponse.json({ bookings: data ?? [] });
});

export const POST = handle(async (req) => {
  const user = await requireRole("ifo_admin", "system_admin");
  const body = (await req.json()) as BookingBody;

  if (!body?.room_id || !body?.occupant_name || !body?.start_datetime || !body?.end_datetime) {
    throw new ApiError("VALIDATION", "room_id, occupant_name, start_datetime, end_datetime are required");
  }
  if (new Date(body.end_datetime) <= new Date(body.start_datetime)) {
    throw new ApiError("VALIDATION", "end_datetime must be after start_datetime");
  }

  const supabase = await createClient();

  // Conflict detection — overlap with existing active bookings or sessions today
  const { data: conflictBookings } = await supabase
    .from("manual_bookings")
    .select("id, occupant_name, start_datetime, end_datetime")
    .eq("room_id", body.room_id)
    .eq("status", "active")
    .lt("start_datetime", body.end_datetime)
    .gt("end_datetime", body.start_datetime);

  if (conflictBookings && conflictBookings.length > 0) {
    throw new ApiError("BOOKING_CONFLICT", "Conflicting booking exists", { bookings: conflictBookings });
  }

  const { data: inserted, error: insErr } = await supabase
    .from("manual_bookings")
    .insert({
      room_id: body.room_id,
      booked_by: user.id,
      occupant_name: body.occupant_name,
      purpose: body.purpose ?? null,
      start_datetime: body.start_datetime,
      end_datetime: body.end_datetime,
      contact_info: body.contact_info ?? null,
      status: "active",
    })
    .select()
    .single();

  if (insErr) throw new ApiError("INTERNAL", insErr.message);

  await auditLog({
    event_type: "BOOKING_CREATED",
    actor_id: user.id,
    target_type: "booking",
    target_id: inserted.id,
    payload: {
      room_id: body.room_id,
      occupant_name: body.occupant_name,
      start: body.start_datetime,
      end: body.end_datetime,
    },
    ip_address: getClientIp(req),
  });

  return NextResponse.json({ booking: inserted }, { status: 201 });
});
