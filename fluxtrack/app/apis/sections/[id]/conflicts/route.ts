import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { handle, ApiError } from "@/lib/api/errors";
import { requireRole } from "@/lib/auth/get-session";
import type { DayOfWeek } from "@/lib/supabase/types";

type Ctx = { params: Promise<{ id: string }> };

// GET /apis/sections/[id]/conflicts?day=mon&start=09:00&end=10:30
// Returns the active schedules that would collide with the hypothetical slot
// for the given section. Used by the move/create wizards.
export const GET = handle(async (req, ctx) => {
  await requireRole("ifo_admin", "system_admin");
  const { id } = await (ctx as Ctx).params;
  const url = new URL(req.url);
  const day = url.searchParams.get("day") as DayOfWeek | null;
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");
  if (!day || !start || !end) {
    throw new ApiError("VALIDATION", "day, start, end query params are required");
  }

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("schedules")
    .select("id, course_code, course_name, day_of_week, start_time, end_time, room_id")
    .eq("is_active", true)
    .eq("section_id", id)
    .eq("day_of_week", day)
    .lt("start_time", end)
    .gt("end_time", start);

  if (error) throw new ApiError("INTERNAL", error.message);
  return NextResponse.json({ conflicts: data ?? [] });
});
