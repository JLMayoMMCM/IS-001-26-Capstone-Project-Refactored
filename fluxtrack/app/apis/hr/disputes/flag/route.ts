import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { handle, ApiError } from "@/lib/api/errors";
import { requireRole } from "@/lib/auth/get-session";
import { auditLog, getClientIp } from "@/lib/audit/log";
import { addMinutesIso, nowUtc } from "@/lib/utils/date";

type Body = {
  session_id: string;
  reason_category?: "wlan_issue" | "camera_issue" | "schedule_error" | "checker_error" | "other";
  hr_flag_note: string;
  explanation?: string;
  deadline_days?: number;
};

// POST /apis/hr/disputes/flag  (BR-HR-2)
// HR raises a system-side dispute (`source = hr_flag`) on a session and stamps
// the session's hr_flag_* fields. hr_flag_note must be >= 20 chars.
export const POST = handle(async (req) => {
  const user = await requireRole("hr_admin", "system_admin");
  const body = (await req.json()) as Body;
  if (!body?.session_id || !body?.hr_flag_note) {
    throw new ApiError("VALIDATION", "session_id and hr_flag_note are required");
  }
  const note = body.hr_flag_note.trim();
  if (note.length < 20) {
    throw new ApiError("VALIDATION", "hr_flag_note must be at least 20 characters");
  }

  const svc = createServiceClient();
  const { data: session, error: sErr } = await svc
    .from("sessions")
    .select("id, faculty_id, payroll_period_id")
    .eq("id", body.session_id)
    .maybeSingle();
  if (sErr) throw new ApiError("INTERNAL", sErr.message);
  if (!session) throw new ApiError("NOT_FOUND", "Session not found");

  // Reject if there's already a pending dispute on this session (BR-FAC-18).
  const { data: existing } = await svc
    .from("disputes")
    .select("id")
    .eq("session_id", session.id)
    .eq("status", "pending")
    .limit(1);
  if (existing && existing.length > 0) {
    throw new ApiError("DISPUTE_DUPLICATE", "A pending dispute already exists for this session");
  }

  const filedAt = nowUtc();
  const deadlineDays = Math.max(1, Math.min(body.deadline_days ?? 14, 30));
  const deadline = addMinutesIso(filedAt, deadlineDays * 24 * 60);

  const explanation = (body.explanation ?? note).padEnd(50, " ");

  const { data: dispute, error: dErr } = await svc
    .from("disputes")
    .insert({
      session_id: session.id,
      faculty_id: session.faculty_id,
      reason_category: body.reason_category ?? "other",
      explanation,
      filed_at: filedAt,
      deadline_at: deadline,
      status: "pending",
      source: "hr_flag",
    })
    .select()
    .single();
  if (dErr) throw new ApiError("INTERNAL", dErr.message);

  await svc
    .from("sessions")
    .update({
      hr_flag_note: note,
      hr_flagged_by: user.id,
      hr_flagged_at: filedAt,
    })
    .eq("id", session.id);

  await auditLog({
    event_type: "dispute.hr_flagged",
    actor_id: user.id,
    target_type: "session",
    target_id: session.id,
    payload: { dispute_id: dispute.id, deadline_at: deadline },
    ip_address: getClientIp(req),
  });

  return NextResponse.json({ dispute }, { status: 201 });
});
