import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { handle, ApiError } from "@/lib/api/errors";
import { getCurrentUser } from "@/lib/auth/get-session";
import { auditLog, getClientIp } from "@/lib/audit/log";
import { addMinutesIso, combineDateTime, nowUtc } from "@/lib/utils/date";
import { canDeclareEnRoute, EN_ROUTE_GRACE_MIN } from "@/lib/utils/session-status";

type EnRouteBody = {
  eta_minutes: number;
  reason: "current_class" | "traffic" | "commute" | "other";
};

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/sessions/[id]/en-route — Faculty declares "I'm running late."
 * Creates an en_route_declarations row, sets session status → en_route,
 * computes hold_expires_at = scheduled_start + eta + 10 min grace.
 */
export const POST = handle(async (req, ctx) => {
  const user = await getCurrentUser();
  const { id } = await (ctx as Ctx).params;
  const body = (await req.json()) as EnRouteBody;

  if (!body?.eta_minutes || body.eta_minutes < 5 || body.eta_minutes > 60) {
    throw new ApiError("VALIDATION", "eta_minutes must be between 5 and 60");
  }
  if (!["current_class", "traffic", "commute", "other"].includes(body.reason)) {
    throw new ApiError("VALIDATION", "invalid reason");
  }

  const supabase = await createClient();
  const { data: ses, error: loadErr } = await supabase
    .from("sessions")
    .select("id, faculty_id, status, session_date, schedule:schedules(start_time)")
    .eq("id", id)
    .single();

  if (loadErr || !ses) throw new ApiError("NOT_FOUND", "Session not found");
  if (ses.faculty_id !== user.id) throw new ApiError("SESSION_NOT_OWNED");
  if (!canDeclareEnRoute(ses.status)) {
    throw new ApiError("SESSION_NOT_ACTIVE", `Cannot declare en-route from status '${ses.status}'`);
  }

  const startTime = (ses as unknown as { schedule: { start_time: string } | null }).schedule?.start_time;
  if (!startTime) throw new ApiError("INTERNAL", "Schedule missing start_time");

  const declaredAt = nowUtc();
  const scheduledStart = combineDateTime(ses.session_date, startTime).toISOString();
  const holdExpiresAt = addMinutesIso(scheduledStart, body.eta_minutes + EN_ROUTE_GRACE_MIN);

  const { data: enRow, error: insErr } = await supabase
    .from("en_route_declarations")
    .insert({
      faculty_id: user.id,
      session_id: ses.id,
      eta_minutes: body.eta_minutes,
      reason: body.reason,
      hold_expires_at: holdExpiresAt,
      declared_at: declaredAt,
      status: "active",
    })
    .select()
    .single();

  if (insErr) throw new ApiError("INTERNAL", insErr.message);

  await supabase.from("sessions").update({ status: "en_route" }).eq("id", ses.id);

  await auditLog({
    event_type: "EN_ROUTE_DECLARED",
    actor_id: user.id,
    target_type: "en_route",
    target_id: enRow.id,
    payload: {
      session_id: ses.id,
      eta_minutes: body.eta_minutes,
      reason: body.reason,
      hold_expires_at: holdExpiresAt,
    },
    ip_address: getClientIp(req),
  });

  return NextResponse.json({ en_route: enRow });
});
