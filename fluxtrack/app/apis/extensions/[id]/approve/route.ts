import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { handle, ApiError } from "@/lib/api/errors";
import { getCurrentUser } from "@/lib/auth/get-session";
import { auditLog, getClientIp } from "@/lib/audit/log";
import { nowUtc } from "@/lib/utils/date";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/extensions/[id]/approve — Incoming faculty (or IFO override) approves.
 */
export const POST = handle(async (req, ctx) => {
  const user = await getCurrentUser();
  const { id } = await (ctx as Ctx).params;
  const supabase = await createClient();

  const { data: ext, error: loadErr } = await supabase
    .from("extension_requests")
    .select("id, status, requesting_session_id, incoming_session_id, response_deadline, incoming:sessions!extension_requests_incoming_session_id_fkey(faculty_id)")
    .eq("id", id)
    .single();
  if (loadErr || !ext) throw new ApiError("NOT_FOUND");
  if (ext.status !== "pending") throw new ApiError("VALIDATION", `Already ${ext.status}`);

  // Authz: incoming faculty OR ifo_admin/system_admin
  const incomingFaculty = (ext as unknown as { incoming: { faculty_id: string } | null }).incoming?.faculty_id;
  if (incomingFaculty !== user.id && user.role !== "ifo_admin" && user.role !== "system_admin") {
    throw new ApiError("FORBIDDEN", "Only the incoming faculty or IFO can approve");
  }

  // Deadline check
  if (ext.response_deadline && new Date(ext.response_deadline).getTime() < Date.now()) {
    throw new ApiError("VALIDATION", "Response deadline has passed");
  }

  const { data: updated, error: upErr } = await supabase
    .from("extension_requests")
    .update({
      status: "approved",
      responded_at: nowUtc(),
      responded_by: user.id,
    })
    .eq("id", id)
    .select()
    .single();
  if (upErr) throw new ApiError("INTERNAL", upErr.message);

  // Mirror onto requesting session
  await supabase
    .from("sessions")
    .update({ extension_status: "approved" })
    .eq("id", ext.requesting_session_id);

  await auditLog({
    event_type: "EXTENSION_APPROVED",
    actor_id: user.id,
    target_type: "extension_request",
    target_id: id,
    payload: { session_id: ext.requesting_session_id },
    ip_address: getClientIp(req),
  });

  return NextResponse.json({ extension: updated });
});
