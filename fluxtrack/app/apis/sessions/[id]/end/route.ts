import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { handle, ApiError } from "@/lib/api/errors";
import { getCurrentUser } from "@/lib/auth/get-session";
import { auditLog, getClientIp } from "@/lib/audit/log";
import { canEnd, EARLY_END_THRESHOLD_MIN } from "@/lib/utils/session-status";
import { nowUtc } from "@/lib/utils/date";
import type { TablesUpdate } from "@/types/database.types";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/sessions/[id]/end             — Faculty ends own active session
 * POST /api/sessions/[id]/end?force=true  — IFO admin force-ends (any session)
 *
 * Computes duration; sets status → completed (>=40m), early_end (<40m), or
 * keeps overstay if it was already in that state. The `force=true` path is
 * IFO-only and records the actor on `force_ended_by` + `force_end_reason`.
 */
export const POST = handle(async (req, ctx) => {
  const user = await getCurrentUser();
  const { id } = await (ctx as Ctx).params;
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "true";
  const supabase = await createClient();

  // Optional reason on force-end
  let reason: string | null = null;
  if (force) {
    if (!["ifo_admin", "system_admin"].includes(user.role)) {
      throw new ApiError("FORBIDDEN", "Only IFO admins can force-end a session");
    }
    try {
      const body = (await req.json()) as { reason?: string };
      reason = body?.reason ?? null;
    } catch {
      /* body is optional */
    }
  }

  const { data: existing, error: loadErr } = await supabase
    .from("sessions")
    .select("id, faculty_id, status, actual_start, overstay_flagged_at")
    .eq("id", id)
    .single();

  if (loadErr || !existing) throw new ApiError("NOT_FOUND", "Session not found");
  if (!force && existing.faculty_id !== user.id) throw new ApiError("SESSION_NOT_OWNED");
  if (!canEnd(existing.status)) {
    throw new ApiError("SESSION_NOT_ACTIVE", `Cannot end a session in status '${existing.status}'`);
  }
  if (!existing.actual_start) throw new ApiError("INTERNAL", "Session has no actual_start");

  const endedAt = nowUtc();
  const startMs = new Date(existing.actual_start).getTime();
  const durationMin = Math.max(0, Math.round((Date.now() - startMs) / 60000));

  const wasOverstay = existing.status === "overstay" || !!existing.overstay_flagged_at;
  const newStatus =
    wasOverstay ? "overstay"
    : durationMin < EARLY_END_THRESHOLD_MIN ? "early_end"
    : "completed";

  const update: TablesUpdate<"sessions"> = {
    status: newStatus,
    actual_end: endedAt,
    duration_minutes: durationMin,
  };
  if (force) {
    update.force_ended_by = user.id;
    update.force_end_reason = reason;
  }

  const { data: updated, error: upErr } = await supabase
    .from("sessions")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();

  if (upErr || !updated) throw new ApiError("INTERNAL", upErr?.message ?? "Failed to update session");

  await auditLog({
    event_type: force
      ? "SESSION_FORCE_ENDED"
      : newStatus === "early_end"
      ? "SESSION_EARLY_END"
      : "SESSION_ENDED",
    actor_id: user.id,
    target_type: "session",
    target_id: id,
    payload: {
      duration_minutes: durationMin,
      ended_at: endedAt,
      final_status: newStatus,
      ...(force ? { force: true, reason } : {}),
    },
    ip_address: getClientIp(req),
  });

  return NextResponse.json({ session: updated });
});
