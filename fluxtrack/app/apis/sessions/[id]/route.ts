import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { handle, ApiError } from "@/lib/api/errors";
import { getCurrentUser } from "@/lib/auth/get-session";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req, ctx) => {
  await getCurrentUser();
  const { id } = await (ctx as Ctx).params;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sessions")
    .select(
      `*,
       schedule:schedules(course_code, course_name, section, enrolled_count, scheduled_modality, start_time, end_time),
       room:rooms(room_code, building, floor_number),
       faculty:users!sessions_faculty_id_fkey(full_name, faculty_id, department, email)`,
    )
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") throw new ApiError("NOT_FOUND", "Session not found");
    throw new ApiError("INTERNAL", error.message);
  }
  return NextResponse.json({ session: data });
});
