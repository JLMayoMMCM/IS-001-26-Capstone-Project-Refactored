import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { handle, ApiError } from "@/lib/api/errors";
import { getCurrentUser, requireRole } from "@/lib/auth/get-session";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req, ctx) => {
  await getCurrentUser();
  const { id } = await (ctx as Ctx).params;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("schedules")
    .select("*, faculty:users!schedules_faculty_id_fkey(full_name, email), room:rooms(room_code, building, floor_number)")
    .eq("id", id)
    .single();
  if (error) throw new ApiError("NOT_FOUND");
  return NextResponse.json({ schedule: data });
});

export const POST = handle(async (req, ctx) => {
  // Treat POST as PATCH for simplicity — IFO updates schedule fields
  await requireRole("ifo_admin", "system_admin");
  const { id } = await (ctx as Ctx).params;
  const body = (await req.json()) as Partial<{
    course_code: string; course_name: string; section: string | null;
    enrolled_count: number; scheduled_modality: "f2f" | "blended" | "online";
    day_of_week: "mon" | "tue" | "wed" | "thu" | "fri" | "sat";
    start_time: string; end_time: string; is_active: boolean;
    room_id: string; faculty_id: string;
    term_start_date: string | null; term_end_date: string | null;
    section_id: string | null;
  }>;
  if (body.term_start_date && body.term_end_date && body.term_end_date < body.term_start_date) {
    throw new ApiError("VALIDATION", "term_end_date must be >= term_start_date");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.from("schedules").update(body).eq("id", id).select().single();
  if (error) throw new ApiError("INTERNAL", error.message);
  return NextResponse.json({ schedule: data });
});
