import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { handle, ApiError } from "@/lib/api/errors";
import { getCurrentUser } from "@/lib/auth/get-session";

/**
 * GET /api/sessions                              — list (RLS filters by role)
 * GET /api/sessions?date=YYYY-MM-DD              — exact day
 * GET /api/sessions?from=YYYY-MM-DD&to=YYYY-MM-DD — inclusive range (live calendar)
 * GET /api/sessions?status=active|completed|...
 * GET /api/sessions?faculty_id=<uuid>            — filter by faculty (admin views)
 */
export const GET = handle(async (req) => {
  const user = await getCurrentUser();
  const url = new URL(req.url);
  const date = url.searchParams.get("date");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const status = url.searchParams.get("status");
  const facultyId = url.searchParams.get("faculty_id");

  const supabase = await createClient();
  let q = supabase
    .from("sessions")
    .select(
      `id, session_date, status, actual_modality, actual_start, actual_end,
       duration_minutes, photo_submitted, wlan_on_campus, self_declared_on_campus,
       extension_status, courtesy_window_start, overstay_flagged_at,
       schedule_id, faculty_id, room_id,
       schedule:schedules(course_code, course_name, section, enrolled_count, scheduled_modality, day_of_week, start_time, end_time),
       faculty:users!sessions_faculty_id_fkey(full_name, email, department),
       room:rooms(room_code, building, floor_number)`,
    )
    .order("session_date", { ascending: false })
    .order("actual_start", { ascending: false });

  if (date) q = q.eq("session_date", date);
  if (from) q = q.gte("session_date", from);
  if (to)   q = q.lte("session_date", to);
  if (status)    q = q.eq("status", status as never);

  // Faculty users can only ever see their own sessions, regardless of the
  // requested ?faculty_id (we ignore it). Admins (ifo/hr/system) may pass
  // ?faculty_id to narrow the result; without it they see all rows.
  // This filter is what keeps things honest in demo mode where RLS is off
  // (see lib/supabase/server.ts → createClient).
  if (user.role === "faculty") {
    q = q.eq("faculty_id", user.id);
  } else if (facultyId) {
    q = q.eq("faculty_id", facultyId);
  }

  // The live-calendar week view requests up to 7 days × ~5 faculty × ~4 sessions
  // (~140 rows). 500 leaves headroom for a small org without pagination.
  const { data, error } = await q.limit(500);
  if (error) throw new ApiError("INTERNAL", error.message);
  return NextResponse.json({ sessions: data ?? [] });
});
