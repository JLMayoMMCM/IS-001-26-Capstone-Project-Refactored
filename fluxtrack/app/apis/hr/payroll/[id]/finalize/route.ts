import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { handle, ApiError } from "@/lib/api/errors";
import { requireRole } from "@/lib/auth/get-session";
import { auditLog, getClientIp } from "@/lib/audit/log";
import { addMinutesIso, nowUtc } from "@/lib/utils/date";

type Ctx = { params: Promise<{ id: string }> };
type FinalizeBody = { stage: "soft" | "hard" };

const SOFT_LOCK_HOURS = 48;

/**
 * POST /api/hr/payroll/[id]/finalize  body: { stage: "soft" | "hard" }
 *
 * Soft lock (BR-5):
 *   - allowed: from `none`
 *   - sets soft_locked_at + soft_lock_expires_at = +48h
 *
 * Hard lock (BR-5):
 *   - allowed: from `soft`
 *   - blocked if any session in period has open dispute
 */
export const POST = handle(async (req, ctx) => {
  const user = await requireRole("hr_admin", "system_admin");
  const { id } = await (ctx as Ctx).params;
  const body = (await req.json()) as FinalizeBody;
  if (!["soft", "hard"].includes(body?.stage)) throw new ApiError("VALIDATION", "stage must be 'soft' or 'hard'");

  const supabase = await createClient();
  const { data: period, error: loadErr } = await supabase
    .from("payroll_periods")
    .select("*")
    .eq("id", id)
    .single();
  if (loadErr || !period) throw new ApiError("NOT_FOUND");

  const now = nowUtc();

  if (body.stage === "soft") {
    if (period.lock_stage !== "none") {
      throw new ApiError("PERIOD_LOCKED", `Period is already ${period.lock_stage}`);
    }
    const expiresAt = addMinutesIso(now, SOFT_LOCK_HOURS * 60);
    const { data: updated, error } = await supabase
      .from("payroll_periods")
      .update({
        lock_stage: "soft",
        soft_locked_at: now,
        soft_lock_expires_at: expiresAt,
      })
      .eq("id", id)
      .select()
      .single();
    if (error) throw new ApiError("INTERNAL", error.message);

    await auditLog({
      event_type: "PAYROLL_SOFT_LOCKED",
      actor_id: user.id,
      target_type: "payroll_period",
      target_id: id,
      payload: { soft_lock_expires_at: expiresAt },
      ip_address: getClientIp(req),
    });

    return NextResponse.json({ period: updated });
  }

  // hard lock
  if (period.lock_stage !== "soft") {
    throw new ApiError("PERIOD_LOCKED", `Cannot hard-lock from ${period.lock_stage} (must be soft)`);
  }

  // Open disputes gate (FR-11)
  const { data: openDisp } = await supabase
    .from("disputes")
    .select("id, session:sessions!disputes_session_id_fkey(payroll_period_id)")
    .eq("status", "pending");
  const openInPeriod = (openDisp ?? []).filter(
    (d) => (d as unknown as { session: { payroll_period_id: string } | null }).session?.payroll_period_id === id,
  );
  if (openInPeriod.length > 0) {
    throw new ApiError("VALIDATION", `${openInPeriod.length} open dispute(s) must be resolved before finalizing`);
  }

  const { data: updated, error } = await supabase
    .from("payroll_periods")
    .update({
      lock_stage: "hard",
      hard_locked_at: now,
      finalized_by: user.id,
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new ApiError("INTERNAL", error.message);

  await auditLog({
    event_type: "PAYROLL_HARD_LOCKED",
    actor_id: user.id,
    target_type: "payroll_period",
    target_id: id,
    payload: { hard_locked_at: now, record_count: period.record_count },
    ip_address: getClientIp(req),
  });

  return NextResponse.json({ period: updated });
});
