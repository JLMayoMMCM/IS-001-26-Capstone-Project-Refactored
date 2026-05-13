import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { handle, ApiError } from "@/lib/api/errors";
import { requireRole } from "@/lib/auth/get-session";
import { auditLog, getClientIp } from "@/lib/audit/log";
import type { DayOfWeek } from "@/lib/supabase/types";

type Body = {
  effective_from: string; // YYYY-MM-DD
  room_id?: string;
  day_of_week?: DayOfWeek;
  start_time?: string;
  end_time?: string;
  section_id?: string;
  dry_run?: boolean;
};
type Ctx = { params: Promise<{ id: string }> };

const VALID_DOW: DayOfWeek[] = ["mon", "tue", "wed", "thu", "fri", "sat"];

// POST /apis/schedules/[id]/move — split-schedule move with conflict pre-check.
// Implements BR-IFO-20..22. Calls the SQL function fn_move_schedule.
export const POST = handle(async (req, ctx) => {
  const user = await requireRole("ifo_admin", "system_admin");
  const { id } = await (ctx as Ctx).params;
  const body = (await req.json()) as Body;

  if (!body.effective_from || !/^\d{4}-\d{2}-\d{2}$/.test(body.effective_from)) {
    throw new ApiError("VALIDATION", "effective_from (YYYY-MM-DD) is required");
  }
  if (body.day_of_week && !VALID_DOW.includes(body.day_of_week)) {
    throw new ApiError("VALIDATION", "day_of_week invalid");
  }
  if (body.start_time && body.end_time && body.end_time <= body.start_time) {
    throw new ApiError("VALIDATION", "end_time must be after start_time");
  }

  const svc = createServiceClient();
  const { data: orig, error: loadErr } = await svc
    .from("schedules")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (loadErr) throw new ApiError("INTERNAL", loadErr.message);
  if (!orig) throw new ApiError("NOT_FOUND", "Schedule not found");
  if (!orig.is_active || orig.archived_at) {
    throw new ApiError("SCHEDULE_ARCHIVED", "Cannot move an archived schedule");
  }
  if (body.effective_from <= new Date().toISOString().slice(0, 10)) {
    throw new ApiError("VALIDATION", "effective_from must be in the future");
  }

  const next = {
    room_id: body.room_id ?? orig.room_id,
    day_of_week: body.day_of_week ?? orig.day_of_week,
    start_time: body.start_time ?? orig.start_time,
    end_time: body.end_time ?? orig.end_time,
    section_id: body.section_id ?? orig.section_id,
  };

  // Pre-check 1: room conflict against any other active schedule
  const { data: roomConflicts } = await svc
    .from("schedules")
    .select("id, course_code, day_of_week, start_time, end_time")
    .eq("is_active", true)
    .eq("room_id", next.room_id)
    .eq("day_of_week", next.day_of_week)
    .lt("start_time", next.end_time)
    .gt("end_time", next.start_time)
    .neq("id", id);

  // Pre-check 2: section conflict (BR-IFO-25)
  let sectionConflicts: { id: string; course_code: string }[] = [];
  if (next.section_id) {
    const { data } = await svc
      .from("schedules")
      .select("id, course_code")
      .eq("is_active", true)
      .eq("section_id", next.section_id)
      .eq("day_of_week", next.day_of_week)
      .lt("start_time", next.end_time)
      .gt("end_time", next.start_time)
      .neq("id", id);
    sectionConflicts = data ?? [];
  }

  const hasConflict = (roomConflicts && roomConflicts.length > 0) || sectionConflicts.length > 0;

  if (hasConflict) {
    throw new ApiError("SCHEDULE_CONFLICT", "Move would create a conflict", {
      room_conflicts: roomConflicts ?? [],
      section_conflicts: sectionConflicts,
    });
  }

  if (body.dry_run) {
    return NextResponse.json({
      ok: true,
      dry_run: true,
      conflicts: { room: [], section: [] },
      diff: {
        room_id: orig.room_id !== next.room_id ? [orig.room_id, next.room_id] : undefined,
        day_of_week: orig.day_of_week !== next.day_of_week ? [orig.day_of_week, next.day_of_week] : undefined,
        start_time: orig.start_time !== next.start_time ? [orig.start_time, next.start_time] : undefined,
        end_time: orig.end_time !== next.end_time ? [orig.end_time, next.end_time] : undefined,
        section_id: orig.section_id !== next.section_id ? [orig.section_id, next.section_id] : undefined,
      },
    });
  }

  // Commit via SQL function (atomic split + re-point + notify)
  const rpcPayload: Record<string, unknown> = {};
  if (body.room_id) rpcPayload.room_id = body.room_id;
  if (body.day_of_week) rpcPayload.day_of_week = body.day_of_week;
  if (body.start_time) rpcPayload.start_time = body.start_time;
  if (body.end_time) rpcPayload.end_time = body.end_time;
  if (body.section_id) rpcPayload.section_id = body.section_id;

  const { data: newId, error: rpcErr } = await svc.rpc("fn_move_schedule", {
    p_schedule_id: id,
    p_effective_from: body.effective_from,
    p_new: rpcPayload,
    p_actor: user.id,
  });
  if (rpcErr) throw new ApiError("INTERNAL", rpcErr.message);

  await auditLog({
    event_type: "schedule.moved",
    actor_id: user.id,
    target_type: "schedule",
    target_id: id,
    payload: { effective_from: body.effective_from, new_schedule_id: newId, ...rpcPayload },
    ip_address: getClientIp(req),
  });

  return NextResponse.json({ ok: true, new_schedule_id: newId });
});
