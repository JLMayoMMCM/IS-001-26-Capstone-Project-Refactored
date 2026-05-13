import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { handle, ApiError } from "@/lib/api/errors";
import { requireRole } from "@/lib/auth/get-session";
import { auditLog, getClientIp } from "@/lib/audit/log";
import { nowUtc } from "@/lib/utils/date";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req, ctx) => {
  await requireRole("ifo_admin", "system_admin", "hr_admin");
  const { id } = await (ctx as Ctx).params;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("manual_bookings")
    .select("*, room:rooms(room_code, building, floor_number)")
    .eq("id", id)
    .single();
  if (error) throw new ApiError("NOT_FOUND", "Booking not found");
  return NextResponse.json({ booking: data });
});

export const POST = handle(async (req, ctx) => {
  // POST is overloaded as "cancel" with `{ reason }` body, since DELETE
  // would require explicit cancel reason and audit trail.
  const user = await requireRole("ifo_admin", "system_admin");
  const { id } = await (ctx as Ctx).params;
  const { reason } = (await req.json()) as { reason?: string };

  if (!reason || reason.trim().length < 3) {
    throw new ApiError("VALIDATION", "Cancellation reason is required (min 3 chars)");
  }

  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("manual_bookings")
    .update({ status: "cancelled", cancelled_at: nowUtc(), cancellation_reason: reason })
    .eq("id", id)
    .eq("status", "active")
    .select()
    .single();

  if (error || !updated) throw new ApiError("NOT_FOUND", "Booking not found or already cancelled");

  await auditLog({
    event_type: "BOOKING_CANCELLED",
    actor_id: user.id,
    target_type: "booking",
    target_id: id,
    payload: { reason },
    ip_address: getClientIp(req),
  });

  return NextResponse.json({ booking: updated });
});
