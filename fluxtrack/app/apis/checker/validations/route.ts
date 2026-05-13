import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { handle, ApiError } from "@/lib/api/errors";
import { requireRole } from "@/lib/auth/get-session";
import { auditLog, getClientIp } from "@/lib/audit/log";
import { nowUtc, todayLocal } from "@/lib/utils/date";

type ValidationBody = {
  session_id: string;
  action: "verified" | "flagged_absent" | "could_not_access";
  note?: string;
  cna_reason?: "room_locked" | "restricted_access" | "room_not_found" | "other";
};

/** GET /api/checker/validations?session_id=...   list validations for a session */
export const GET = handle(async (req) => {
  await requireRole("checker", "ifo_admin", "hr_admin", "system_admin");
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("session_id");

  const supabase = await createClient();
  let q = supabase
    .from("checker_validations")
    .select("*, checker:users!checker_validations_checker_id_fkey(full_name)")
    .order("validated_at", { ascending: false });
  if (sessionId) q = q.eq("session_id", sessionId);

  const { data, error } = await q;
  if (error) throw new ApiError("INTERNAL", error.message);
  return NextResponse.json({ validations: data ?? [] });
});

/**
 * POST /api/checker/validations
 *
 * Body: { session_id, action, note?, cna_reason? }
 *
 * Side-effects per BR-4:
 *   - flagged_absent: session.status → checker_flagged (Checker observation supersedes photo)
 *   - could_not_access: increment shift.rooms_skipped
 *   - verified: increment shift.rooms_validated
 */
export const POST = handle(async (req) => {
  const user = await requireRole("checker");
  const body = (await req.json()) as ValidationBody;

  if (!body?.session_id || !body?.action) {
    throw new ApiError("VALIDATION", "session_id and action are required");
  }
  if (body.action === "flagged_absent" && (!body.note || body.note.trim().length < 10)) {
    throw new ApiError("VALIDATION", "Flag as Absent requires note (min 10 chars)");
  }
  if (body.action === "could_not_access" && !body.cna_reason) {
    throw new ApiError("VALIDATION", "CNA action requires cna_reason");
  }

  const supabase = await createClient();
  const today = todayLocal();
  const validatedAt = nowUtc();

  // Find checker's active shift today
  const { data: shift, error: shiftErr } = await supabase
    .from("checker_shifts")
    .select("id, rooms_validated, rooms_skipped")
    .eq("user_id", user.id)
    .eq("shift_date", today)
    .single();
  if (shiftErr || !shift) throw new ApiError("VALIDATION", "No active shift today — start shift first");

  // Insert validation row
  const { data: row, error: insErr } = await supabase
    .from("checker_validations")
    .insert({
      session_id: body.session_id,
      checker_id: user.id,
      action: body.action,
      note: body.note ?? null,
      cna_reason: body.cna_reason ?? null,
      validated_at: validatedAt,
      shift_id: shift.id,
    })
    .select()
    .single();
  if (insErr) throw new ApiError("INTERNAL", insErr.message);

  // Side-effects
  if (body.action === "flagged_absent") {
    await supabase.from("sessions").update({ status: "checker_flagged" }).eq("id", body.session_id);
  }
  if (body.action === "verified") {
    await supabase.from("checker_shifts").update({ rooms_validated: shift.rooms_validated + 1 }).eq("id", shift.id);
  }
  if (body.action === "could_not_access") {
    await supabase.from("checker_shifts").update({ rooms_skipped: shift.rooms_skipped + 1 }).eq("id", shift.id);
  }

  await auditLog({
    event_type:
      body.action === "verified" ? "CHECKER_VERIFIED"
      : body.action === "flagged_absent" ? "CHECKER_FLAGGED"
      : "CHECKER_CNA",
    actor_id: user.id,
    target_type: "validation",
    target_id: row.id,
    payload: {
      session_id: body.session_id,
      action: body.action,
      cna_reason: body.cna_reason ?? null,
      note: body.note ?? null,
    },
    ip_address: getClientIp(req),
  });

  return NextResponse.json({ validation: row });
});
