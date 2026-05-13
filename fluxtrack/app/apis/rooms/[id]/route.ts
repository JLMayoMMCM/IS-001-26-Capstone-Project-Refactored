import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { handle, ApiError } from "@/lib/api/errors";
import { requireRole, getCurrentUser } from "@/lib/auth/get-session";
import { auditLog, getClientIp } from "@/lib/audit/log";
import { todayLocal } from "@/lib/utils/date";
import type { RoomsUpdate } from "@/lib/supabase/types";

type Ctx = { params: Promise<{ id: string }> };

type PatchBody = {
  room_code?: string;
  building?: string;
  floor_number?: number;
  room_type?: "lecture" | "lab" | "other";
  capacity?: number | null;
  is_active?: boolean;
};

export const GET = handle(async (_req, ctx) => {
  await getCurrentUser();
  const { id } = await (ctx as Ctx).params;
  const svc = createServiceClient();

  const { data: room, error } = await svc
    .from("rooms")
    .select("id, room_code, building, floor_number, room_type, capacity, is_active")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new ApiError("INTERNAL", error.message);
  if (!room) throw new ApiError("NOT_FOUND", "Room not found");

  const today = todayLocal();
  const { data: occupants } = await svc
    .from("sessions")
    .select(
      `id, status, actual_modality, actual_start,
       schedule:schedules(course_code, start_time, end_time),
       faculty:users!sessions_faculty_id_fkey(id, full_name)`,
    )
    .eq("room_id", id)
    .eq("session_date", today)
    .in("status", ["active", "overstay", "pending", "en_route"]);

  return NextResponse.json({
    room,
    current_sessions: occupants ?? [],
  });
});

export const PATCH = handle(async (req, ctx) => {
  const user = await requireRole("ifo_admin", "system_admin");
  const { id } = await (ctx as Ctx).params;
  const body = (await req.json()) as PatchBody;

  const update: RoomsUpdate = {};
  if (body.room_code !== undefined) update.room_code = body.room_code;
  if (body.building !== undefined) update.building = body.building;
  if (body.floor_number !== undefined) update.floor_number = body.floor_number;
  if (body.room_type !== undefined) update.room_type = body.room_type;
  if (body.capacity !== undefined) update.capacity = body.capacity;
  if (body.is_active !== undefined) update.is_active = body.is_active;
  if (Object.keys(update).length === 0) {
    throw new ApiError("VALIDATION", "No fields to update");
  }

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("rooms")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) {
    if ((error as { code?: string }).code === "23505") {
      throw new ApiError("VALIDATION", "room_code already in use");
    }
    throw new ApiError("INTERNAL", error.message);
  }

  await auditLog({
    event_type: body.is_active === false ? "room.deactivated" : "room.updated",
    actor_id: user.id,
    target_type: "room",
    target_id: id,
    payload: update,
    ip_address: getClientIp(req),
  });

  return NextResponse.json({ room: data });
});
