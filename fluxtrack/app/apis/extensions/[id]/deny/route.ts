import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { handle, ApiError } from "@/lib/api/errors";
import { getCurrentUser } from "@/lib/auth/get-session";
import { auditLog, getClientIp } from "@/lib/audit/log";
import { nowUtc } from "@/lib/utils/date";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/extensions/[id]/deny — Incoming faculty (or IFO override) denies.
 * Triggers the 5-min courtesy window on the requesting session (BR-3.04).
 */
export const POST = handle(async (req, ctx) => {
  const user = await getCurrentUser();
  const { id } = await (ctx as Ctx).params;
  const supabase = await createClient();

  const { data: ext, error: loadErr } = await supabase
    .from("extension_requests")
    .select("id, status, requesting_session_id, response_deadline, incoming:sessions!extension_requests_incoming_session_id_fkey(faculty_id)")
    .eq("id", id)
    .single();
  if (loadErr || !ext) throw new ApiError("NOT_FOUND");
  if (ext.status !== "pending") throw new ApiError("VALIDATION", `Already ${ext.status}`);

  const incomingFaculty = (ext as unknown as { incoming: { faculty_id: string } | null }).incoming?.faculty_id;
  if (incomingFaculty !== user.id && user.role !== "ifo_admin" && user.role !== "system_admin") {
    throw new ApiError("FORBIDDEN", "Only the incoming faculty or IFO can deny");
  }

  const respondedAt = nowUtc();
  const { data: updated, error: upErr } = await supabase
    .from("extension_requests")
    .update({
      status: "denied",
      responded_at: respondedAt,
      responded_by: user.id,
    })
    .eq("id", id)
    .select()
    .single();
  if (upErr) throw new ApiError("INTERNAL", upErr.message);

  // BR-3.04: open courtesy window on the requesting session
  await supabase
    .from("sessions")
    .update({
      extension_status: "denied",
      courtesy_window_start: respondedAt,
    })
    .eq("id", ext.requesting_session_id);

  await auditLog({
    event_type: "EXTENSION_DENIED",
    actor_id: user.id,
    target_type: "extension_request",
    target_id: id,
    payload: { session_id: ext.requesting_session_id, courtesy_window_start: respondedAt },
    ip_address: getClientIp(req),
  });

  return NextResponse.json({ extension: updated });
});
