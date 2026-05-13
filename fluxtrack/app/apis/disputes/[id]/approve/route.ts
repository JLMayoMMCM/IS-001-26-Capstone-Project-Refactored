import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { handle, ApiError } from "@/lib/api/errors";
import { requireRole } from "@/lib/auth/get-session";
import { auditLog, getClientIp } from "@/lib/audit/log";
import { nowUtc } from "@/lib/utils/date";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/disputes/[id]/approve
 * Body: { decision_note?: string, amend_status?: SessionStatus }
 * IFO Admin approves the dispute and optionally amends the session status.
 */
export const POST = handle(async (req, ctx) => {
  const user = await requireRole("ifo_admin", "system_admin");
  const { id } = await (ctx as Ctx).params;
  const body = (await req.json().catch(() => ({}))) as {
    decision_note?: string;
    remedial_action?: "restore_completed" | "mark_early_end" | "keep_status" | "manual_adjust";
    amend_status?: "completed" | "early_end" | "absent";
  };

  // BR-IFO-11: approval requires a remedial_action AND a decision_note >= 20 chars.
  const VALID_REMEDIAL: ReadonlyArray<NonNullable<typeof body.remedial_action>> = [
    "restore_completed",
    "mark_early_end",
    "keep_status",
    "manual_adjust",
  ];
  if (!body.remedial_action || !VALID_REMEDIAL.includes(body.remedial_action)) {
    throw new ApiError("VALIDATION", "remedial_action is required for approval", {
      allowed: VALID_REMEDIAL,
    });
  }
  const note = (body.decision_note ?? "").trim();
  if (note.length < 20) {
    throw new ApiError("VALIDATION", "decision_note must be at least 20 characters");
  }

  const supabase = await createClient();
  const reviewedAt = nowUtc();

  const { data: disp, error: loadErr } = await supabase
    .from("disputes")
    .select("id, session_id, status")
    .eq("id", id)
    .single();
  if (loadErr || !disp) throw new ApiError("NOT_FOUND", "Dispute not found");
  if (disp.status !== "pending") throw new ApiError("VALIDATION", `Dispute is already ${disp.status}`);

  const { data: updated, error: upErr } = await supabase
    .from("disputes")
    .update({
      status: "approved",
      reviewed_by: user.id,
      reviewed_at: reviewedAt,
      decision_note: note,
      remedial_action: body.remedial_action,
    })
    .eq("id", id)
    .select()
    .single();
  if (upErr) throw new ApiError("INTERNAL", upErr.message);

  // Derive the session amendment from the remedial action when the caller
  // hasn't supplied one explicitly.
  const amendStatus =
    body.amend_status ??
    (body.remedial_action === "restore_completed" ? "completed" :
     body.remedial_action === "mark_early_end"    ? "early_end" :
     null);

  if (amendStatus) {
    await supabase.from("sessions").update({ status: amendStatus }).eq("id", disp.session_id);
  }

  await auditLog({
    event_type: "dispute.approved",
    actor_id: user.id,
    target_type: "dispute",
    target_id: id,
    payload: {
      session_id: disp.session_id,
      remedial_action: body.remedial_action,
      amend_status: amendStatus,
      note,
    },
    ip_address: getClientIp(req),
  });

  return NextResponse.json({ dispute: updated });
});
