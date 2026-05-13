import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { handle, ApiError } from "@/lib/api/errors";
import { getCurrentUser } from "@/lib/auth/get-session";
import { auditLog, getClientIp } from "@/lib/audit/log";
import { nowUtc } from "@/lib/utils/date";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/checker/shifts/[id]/start — checker/guard taps "Start My Shift". */
export const POST = handle(async (req, ctx) => {
  const user = await getCurrentUser();
  const { id } = await (ctx as Ctx).params;
  const supabase = await createClient();

  const { data: shift, error: loadErr } = await supabase
    .from("checker_shifts")
    .select("id, user_id, actual_start")
    .eq("id", id)
    .single();
  if (loadErr || !shift) throw new ApiError("NOT_FOUND");
  if (shift.user_id !== user.id) throw new ApiError("FORBIDDEN", "Not your shift");
  if (shift.actual_start) throw new ApiError("VALIDATION", "Shift already started");

  const startedAt = nowUtc();
  const { data: updated, error: upErr } = await supabase
    .from("checker_shifts")
    .update({ actual_start: startedAt })
    .eq("id", id)
    .select()
    .single();
  if (upErr) throw new ApiError("INTERNAL", upErr.message);

  await auditLog({
    event_type: "CHECKER_SHIFT_STARTED",
    actor_id: user.id,
    target_type: "shift",
    target_id: id,
    payload: { actual_start: startedAt },
    ip_address: getClientIp(req),
  });

  return NextResponse.json({ shift: updated });
});
