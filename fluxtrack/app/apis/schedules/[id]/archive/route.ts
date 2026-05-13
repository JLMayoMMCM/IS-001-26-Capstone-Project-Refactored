import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { handle, ApiError } from "@/lib/api/errors";
import { requireRole } from "@/lib/auth/get-session";
import { auditLog, getClientIp } from "@/lib/audit/log";
import { nowUtc } from "@/lib/utils/date";

type Body = { archive_reason?: string; restore?: boolean };
type Ctx = { params: Promise<{ id: string }> };

// POST /apis/schedules/[id]/archive — soft-remove a schedule (BR-IFO-17)
// POST /apis/schedules/[id]/archive?restore=1 — restore an archived schedule (BR-IFO-19)
export const POST = handle(async (req, ctx) => {
  const user = await requireRole("ifo_admin", "system_admin");
  const { id } = await (ctx as Ctx).params;
  const url = new URL(req.url);
  const body = (await req.json().catch(() => ({}))) as Body;
  const wantRestore = body.restore === true || url.searchParams.get("restore") === "1";

  const svc = createServiceClient();
  const { data: existing, error: loadErr } = await svc
    .from("schedules")
    .select("id, is_active, archived_at, room_id, day_of_week, start_time, end_time, section_id, academic_term, course_code")
    .eq("id", id)
    .maybeSingle();
  if (loadErr) throw new ApiError("INTERNAL", loadErr.message);
  if (!existing) throw new ApiError("NOT_FOUND", "Schedule not found");

  if (wantRestore) {
    if (existing.is_active && !existing.archived_at) {
      throw new ApiError("VALIDATION", "Schedule is not archived");
    }
    // BR-IFO-19: ensure no overlapping active schedule has reclaimed the slot.
    const { data: conflict } = await svc
      .from("schedules")
      .select("id, course_code")
      .eq("is_active", true)
      .eq("room_id", existing.room_id)
      .eq("day_of_week", existing.day_of_week)
      .lt("start_time", existing.end_time)
      .gt("end_time", existing.start_time)
      .neq("id", id)
      .limit(5);
    if (conflict && conflict.length > 0) {
      throw new ApiError("SCHEDULE_CONFLICT", "Slot reclaimed by another active schedule", {
        conflicts: conflict,
      });
    }

    const { data: restored, error: upErr } = await svc
      .from("schedules")
      .update({
        is_active: true,
        archived_at: null,
        archived_by: null,
        archive_reason: null,
      })
      .eq("id", id)
      .select("*")
      .single();
    if (upErr) throw new ApiError("INTERNAL", upErr.message);

    await auditLog({
      event_type: "schedule.restored",
      actor_id: user.id,
      target_type: "schedule",
      target_id: id,
      payload: { course_code: existing.course_code },
      ip_address: getClientIp(req),
    });
    return NextResponse.json({ schedule: restored });
  }

  // Archive path
  const reason = (body.archive_reason ?? "").trim();
  if (reason.length < 20) {
    throw new ApiError("VALIDATION", "archive_reason must be at least 20 characters");
  }
  if (!existing.is_active || existing.archived_at) {
    throw new ApiError("SCHEDULE_ARCHIVED", "Schedule is already archived");
  }

  const archivedAt = nowUtc();
  const { data: archived, error: archErr } = await svc
    .from("schedules")
    .update({
      is_active: false,
      archived_at: archivedAt,
      archived_by: user.id,
      archive_reason: reason,
    })
    .eq("id", id)
    .select("*")
    .single();
  if (archErr) throw new ApiError("INTERNAL", archErr.message);

  // Drop any future `scheduled` sessions so they don't auto-materialize attendance gaps
  const today = new Date().toISOString().slice(0, 10);
  const { data: deletedSessions } = await svc
    .from("sessions")
    .delete()
    .eq("schedule_id", id)
    .eq("status", "scheduled")
    .gte("session_date", today)
    .select("id");

  await auditLog({
    event_type: "schedule.archived",
    actor_id: user.id,
    target_type: "schedule",
    target_id: id,
    payload: {
      course_code: existing.course_code,
      reason,
      future_sessions_removed: deletedSessions?.length ?? 0,
    },
    ip_address: getClientIp(req),
  });

  return NextResponse.json({ schedule: archived });
});
