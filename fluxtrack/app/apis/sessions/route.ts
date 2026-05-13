import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { handle, ApiError } from "@/lib/api/errors";
import { getCurrentUser } from "@/lib/auth/get-session";

/**
 * GET /api/sessions              — list (RLS filters by role)
 * GET /api/sessions?date=YYYY-MM-DD
 * GET /api/sessions?status=active|completed|...
 */
export const GET = handle(async (req) => {
  await getCurrentUser();
  const url = new URL(req.url);
  const date = url.searchParams.get("date");
  const status = url.searchParams.get("status");

  const supabase = await createClient();
  let q = supabase
    .from("sessions")
    .select(
      `id, session_date, status, actual_modality, actual_start, actual_end,
       duration_minutes, photo_submitted, wlan_on_campus, self_declared_on_campus,
       extension_status, courtesy_window_start, overstay_flagged_at,
       schedule_id, faculty_id, room_id,
       schedule:schedules(course_code, course_name, section, enrolled_count, scheduled_modality, start_time, end_time),
       room:rooms(room_code, building, floor_number)`,
    )
    .order("session_date", { ascending: false })
    .order("actual_start", { ascending: false });

  if (date) q = q.eq("session_date", date);
  if (status) q = q.eq("status", status as never);

  const { data, error } = await q.limit(200);
  if (error) throw new ApiError("INTERNAL", error.message);
  return NextResponse.json({ sessions: data ?? [] });
});
