import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { handle, ApiError } from "@/lib/api/errors";
import { requireRole } from "@/lib/auth/get-session";
import { auditLog, getClientIp } from "@/lib/audit/log";
import { nowUtc } from "@/lib/utils/date";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/disputes/[id]/deny — IFO Admin denies a dispute.
 * Body: { decision_note: string }  (required, ≥10 chars)
 */
export const POST = handle(async (req, ctx) => {
  const user = await requireRole("ifo_admin", "system_admin");
  const { id } = await (ctx as Ctx).params;
  const { decision_note } = (await req.json()) as { decision_note?: string };

  // BR-IFO: decision_note required, >= 20 chars (matches DB CHECK).
  if (!decision_note || decision_note.trim().length < 20) {
    throw new ApiError("VALIDATION", "decision_note required (min 20 chars)");
  }

  const supabase = await createClient();

  const { data: disp, error: loadErr } = await supabase
    .from("disputes")
    .select("id, session_id, status")
    .eq("id", id)
    .single();
  if (loadErr || !disp) throw new ApiError("NOT_FOUND");
  if (disp.status !== "pending") throw new ApiError("VALIDATION", `Already ${disp.status}`);

  const { data: updated, error: upErr } = await supabase
    .from("disputes")
    .update({
      status: "denied",
      reviewed_by: user.id,
      reviewed_at: nowUtc(),
      decision_note: decision_note.trim(),
    })
    .eq("id", id)
    .select()
    .single();
  if (upErr) throw new ApiError("INTERNAL", upErr.message);

  await auditLog({
    event_type: "DISPUTE_DENIED",
    actor_id: user.id,
    target_type: "dispute",
    target_id: id,
    payload: { session_id: disp.session_id, note: decision_note.trim() },
    ip_address: getClientIp(req),
  });

  return NextResponse.json({ dispute: updated });
});
