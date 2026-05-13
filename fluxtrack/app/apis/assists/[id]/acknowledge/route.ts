import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { handle, ApiError } from "@/lib/api/errors";
import { getCurrentUser } from "@/lib/auth/get-session";
import { auditLog, getClientIp } from "@/lib/audit/log";
import { nowUtc } from "@/lib/utils/date";
import type { TablesUpdate } from "@/types/database.types";

type Ctx = { params: Promise<{ id: string }> };
type AckBody = {
  source?: "ifo" | "guard" | "checker";
  incident_note?: string;
  resolution_status?: "resolved_onsite" | "referred_ifo" | "referred_external" | "no_issue" | "other";
};

/**
 * POST /api/assists/[id]/acknowledge
 *   - IFO Admin sets `ifo_acknowledged_*`
 *   - Guard/Checker sets `guard_acknowledged_*` (and may attach an incident log)
 */
export const POST = handle(async (req, ctx) => {
  const user = await getCurrentUser();
  const { id } = await (ctx as Ctx).params;
  const body = (await req.json().catch(() => ({}))) as AckBody;

  const role = user.role;
  if (!["ifo_admin", "guard", "checker", "system_admin"].includes(role)) {
    throw new ApiError("FORBIDDEN");
  }

  const supabase = await createClient();
  const ackedAt = nowUtc();

  // IFO acknowledgement is treated separately from the floor-staff acknowledgement
  let updates: TablesUpdate<"assist_requests">;
  if (role === "ifo_admin" || role === "system_admin" || body.source === "ifo") {
    updates = {
      ifo_acknowledged_by: user.id,
      ifo_acknowledged_at: ackedAt,
    };
  } else {
    updates = {
      guard_acknowledged_by: user.id,
      guard_acknowledged_at: ackedAt,
      ...(body.incident_note ? { guard_incident_note: body.incident_note, guard_incident_logged_at: ackedAt } : {}),
      ...(body.resolution_status ? { guard_resolution_status: body.resolution_status } : {}),
    };
  }

  const { data, error } = await supabase
    .from("assist_requests")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) throw new ApiError("NOT_FOUND", error.message);

  await auditLog({
    event_type: "ASSIST_ACKNOWLEDGED",
    actor_id: user.id,
    target_type: "assist",
    target_id: id,
    payload: { role, ...body },
    ip_address: getClientIp(req),
  });

  return NextResponse.json({ assist: data });
});
