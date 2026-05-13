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
    amend_status?: "completed" | "early_end" | "absent";
  };

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
      decision_note: body.decision_note ?? null,
    })
    .eq("id", id)
    .select()
    .single();
  if (upErr) throw new ApiError("INTERNAL", upErr.message);

  // Optionally amend the session status
  if (body.amend_status) {
    await supabase.from("sessions").update({ status: body.amend_status }).eq("id", disp.session_id);
  }

  await auditLog({
    event_type: "DISPUTE_APPROVED",
    actor_id: user.id,
    target_type: "dispute",
    target_id: id,
    payload: { session_id: disp.session_id, amend_status: body.amend_status ?? null, note: body.decision_note ?? null },
    ip_address: getClientIp(req),
  });

  return NextResponse.json({ dispute: updated });
});
