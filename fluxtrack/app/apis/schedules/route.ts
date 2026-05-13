import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { handle, ApiError } from "@/lib/api/errors";
import { getCurrentUser } from "@/lib/auth/get-session";
import { dayOfWeekKey, todayLocal } from "@/lib/utils/date";

/**
 * GET /api/schedules           — all schedules visible to caller (RLS filters)
 * GET /api/schedules?day=today — today's day_of_week, joined with rooms.
 *                                Faculty sees their own; IFO/HR see all.
 */
export const GET = handle(async (req) => {
  const user = await getCurrentUser();
  const url = new URL(req.url);
  const day = url.searchParams.get("day");

  const supabase = await createClient();

  let query = supabase
    .from("schedules")
    .select(
      `id, course_code, course_name, section, enrolled_count,
       scheduled_modality, day_of_week, start_time, end_time,
       academic_term, is_active, faculty_id,
       room:rooms(id, room_code, building, floor_number)`,
    )
    .eq("is_active", true);

  if (day === "today") {
    const dow = dayOfWeekKey();
    if (dow === "sun") {
      return NextResponse.json({ schedules: [], date: todayLocal() });
    }
    query = query.eq("day_of_week", dow);
  }

  const { data, error } = await query.order("start_time");
  if (error) throw new ApiError("INTERNAL", error.message);

  const filtered =
    user.role === "faculty"
      ? (data ?? []).filter((s) => s.faculty_id === user.id)
      : (data ?? []);

  return NextResponse.json({ schedules: filtered, date: todayLocal() });
});
