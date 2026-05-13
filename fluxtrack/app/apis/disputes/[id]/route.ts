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
    .from("disputes")
    .select(
      `*,
       session:sessions(*, room:rooms(room_code, building, floor_number),
                          schedule:schedules(course_code, course_name)),
       faculty:users!disputes_faculty_id_fkey(full_name, email, faculty_id, department),
       reviewer:users!disputes_reviewed_by_fkey(full_name)`,
    )
    .eq("id", id)
    .single();

  if (error) throw new ApiError("NOT_FOUND", "Dispute not found");
  return NextResponse.json({ dispute: data });
});
