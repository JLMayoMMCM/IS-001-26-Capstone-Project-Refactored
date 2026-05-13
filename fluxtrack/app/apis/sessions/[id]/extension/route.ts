import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { handle, ApiError } from "@/lib/api/errors";
import { getCurrentUser } from "@/lib/auth/get-session";
import { auditLog, getClientIp } from "@/lib/audit/log";
import { addMinutesIso, nowUtc } from "@/lib/utils/date";
import { EXTENSION_WINDOW_MIN, EXT_MAX_NO_INCOMING, EXT_MAX_WITH_INCOMING } from "@/lib/utils/session-status";

type ExtBody = { requested_minutes: number };
type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/sessions/[id]/extension — Faculty requests an extension.
 *
 * Logic per BR-3:
 *   - Must be active and within 30-min extension window (BR-3.01)
 *   - One request per session enforced by UNIQUE on requesting_session_id (BR-3.03)
 *   - If no incoming session: auto-approved, max 30 min (BR-3.02)
 *   - If incoming session: pending, max 20 min, 3-min response deadline
 */
export const POST = handle(async (req, ctx) => {
  const user = await getCurrentUser();
  const { id } = await (ctx as Ctx).params;
  const body = (await req.json()) as ExtBody;

  if (!body?.requested_minutes || body.requested_minutes < 1) {
    throw new ApiError("VALIDATION", "requested_minutes must be >= 1");
  }

  const supabase = await createClient();

  // Load session
  const { data: ses, error: loadErr } = await supabase
    .from("sessions")
    .select("id, faculty_id, status, actual_start, room_id, schedule_id, extension_status")
    .eq("id", id)
    .single();

  if (loadErr || !ses) throw new ApiError("NOT_FOUND", "Session not found");
  if (ses.faculty_id !== user.id) throw new ApiError("SESSION_NOT_OWNED");
  if (ses.status !== "active") throw new ApiError("SESSION_NOT_ACTIVE");
  if (ses.extension_status !== "none") throw new ApiError("EXTENSION_ALREADY_REQUESTED");
  if (!ses.actual_start) throw new ApiError("INTERNAL", "active session missing actual_start");

  // Window check (BR-3.01) — server-authoritative
  const elapsedMin = (Date.now() - new Date(ses.actual_start).getTime()) / 60000;
  if (elapsedMin > EXTENSION_WINDOW_MIN) {
    throw new ApiError("EXTENSION_WINDOW_CLOSED");
  }

  // Look for an incoming session in the same room, today, after this one
  const { data: schedule } = await supabase
    .from("schedules")
    .select("end_time")
    .eq("id", ses.schedule_id)
    .single();

  const today = new Date().toISOString().slice(0, 10);
  const { data: incomingList } = await supabase
    .from("sessions")
    .select("id, faculty_id, schedule_id, schedule:schedules(start_time, end_time)")
    .eq("room_id", ses.room_id)
    .eq("session_date", today)
    .neq("id", ses.id)
    .order("session_date", { ascending: true });

  let incoming: { id: string; faculty_id: string } | null = null;
  if (schedule && incomingList) {
    const myEnd = schedule.end_time;
    for (const row of incomingList) {
      const s = (row as unknown as { schedule: { start_time: string } | null }).schedule;
      if (s?.start_time && s.start_time >= myEnd) {
        incoming = { id: row.id, faculty_id: row.faculty_id };
        break;
      }
    }
  }

  const requestedAt = nowUtc();
  let approvedMinutes: number;
  let status: "pending" | "auto_approved";
  let responseDeadline: string | null;

  if (incoming) {
    approvedMinutes = Math.min(body.requested_minutes, EXT_MAX_WITH_INCOMING);
    status = "pending";
    responseDeadline = addMinutesIso(requestedAt, 3);
  } else {
    approvedMinutes = Math.min(body.requested_minutes, EXT_MAX_NO_INCOMING);
    status = "auto_approved";
    responseDeadline = null;
  }

  // Insert extension request — UNIQUE on requesting_session_id enforces "one per session"
  const { data: extRow, error: insErr } = await supabase
    .from("extension_requests")
    .insert({
      requesting_session_id: ses.id,
      incoming_session_id: incoming?.id ?? null,
      requested_minutes: approvedMinutes,
      status,
      requested_at: requestedAt,
      response_deadline: responseDeadline,
    })
    .select()
    .single();

  if (insErr) {
    if ((insErr.code ?? "") === "23505") throw new ApiError("EXTENSION_ALREADY_REQUESTED");
    throw new ApiError("INTERNAL", insErr.message);
  }

  // Mirror onto session
  await supabase
    .from("sessions")
    .update({ extension_status: status })
    .eq("id", ses.id);

  await auditLog({
    event_type: status === "auto_approved" ? "EXTENSION_AUTO_APPROVED" : "EXTENSION_REQUESTED",
    actor_id: user.id,
    target_type: "extension_request",
    target_id: extRow.id,
    payload: {
      session_id: ses.id,
      requested_minutes: approvedMinutes,
      has_incoming: !!incoming,
      incoming_faculty_id: incoming?.faculty_id ?? null,
    },
    ip_address: getClientIp(req),
  });

  return NextResponse.json({ extension: extRow });
});
