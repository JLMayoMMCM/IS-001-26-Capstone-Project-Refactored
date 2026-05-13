import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { handle, ApiError } from "@/lib/api/errors";
import { getCurrentUser } from "@/lib/auth/get-session";
import { auditLog, getClientIp } from "@/lib/audit/log";
import { addMinutesIso, nowUtc } from "@/lib/utils/date";

type DisputeBody = {
  session_id: string;
  reason_category: "wlan_issue" | "camera_issue" | "schedule_error" | "checker_error" | "other";
  explanation: string;
  evidence_storage_path?: string;
};

const HOURS_72 = 72 * 60;

export const GET = handle(async (req) => {
  const user = await getCurrentUser();
  const url = new URL(req.url);
  const status = url.searchParams.get("status");

  const supabase = await createClient();
  let q = supabase
    .from("disputes")
    .select(
      `*,
       session:sessions(id, session_date, status, room:rooms(room_code, building),
                        schedule:schedules(course_code, course_name)),
       faculty:users!disputes_faculty_id_fkey(full_name, email, faculty_id)`,
    )
    .order("filed_at", { ascending: false });

  if (status) q = q.eq("status", status as never);

  const { data, error } = await q;
  if (error) throw new ApiError("INTERNAL", error.message);

  // Faculty: only their own disputes (RLS handles it; this is defense in depth)
  const filtered =
    user.role === "faculty"
      ? (data ?? []).filter((d) => d.faculty_id === user.id)
      : (data ?? []);

  return NextResponse.json({ disputes: filtered });
});

export const POST = handle(async (req) => {
  const user = await getCurrentUser();
  const body = (await req.json()) as DisputeBody;

  if (!body?.session_id || !body?.reason_category || !body?.explanation) {
    throw new ApiError("VALIDATION", "session_id, reason_category, explanation are required");
  }
  if (body.explanation.trim().length < 50) {
    throw new ApiError("VALIDATION", "explanation must be at least 50 characters");
  }

  const supabase = await createClient();

  // Load session to (a) confirm ownership for faculty, (b) compute deadline
  const { data: ses, error: loadErr } = await supabase
    .from("sessions")
    .select("id, faculty_id, status, actual_end")
    .eq("id", body.session_id)
    .single();

  if (loadErr || !ses) throw new ApiError("NOT_FOUND", "Session not found");

  const isHrFlag = user.role === "hr_admin";
  if (!isHrFlag && ses.faculty_id !== user.id) throw new ApiError("SESSION_NOT_OWNED");

  const filedAt = nowUtc();
  const referenceTime = ses.actual_end ?? filedAt; // disputes can be filed for absent sessions
  const deadlineAt = addMinutesIso(referenceTime, HOURS_72);

  const { data: disp, error: insErr } = await supabase
    .from("disputes")
    .insert({
      session_id: body.session_id,
      faculty_id: ses.faculty_id, // dispute is on behalf of the faculty
      reason_category: body.reason_category,
      explanation: body.explanation.trim(),
      evidence_storage_path: body.evidence_storage_path ?? null,
      filed_at: filedAt,
      deadline_at: deadlineAt,
      status: "pending",
      source: isHrFlag ? "hr_flag" : "faculty",
    })
    .select()
    .single();

  if (insErr) throw new ApiError("INTERNAL", insErr.message);

  await auditLog({
    event_type: "DISPUTE_FILED",
    actor_id: user.id,
    target_type: "dispute",
    target_id: disp.id,
    payload: {
      session_id: body.session_id,
      reason_category: body.reason_category,
      source: isHrFlag ? "hr_flag" : "faculty",
    },
    ip_address: getClientIp(req),
  });

  return NextResponse.json({ dispute: disp }, { status: 201 });
});
