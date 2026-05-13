import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { handle, ApiError } from "@/lib/api/errors";
import { requireRole } from "@/lib/auth/get-session";
import { auditLog, getClientIp } from "@/lib/audit/log";

type CopyBody = {
  from_date: string; // YYYY-MM-DD
  to_date: string;   // YYYY-MM-DD
  role?: "checker" | "guard"; // optional filter
};

/**
 * POST /api/checker/shifts/copy
 *
 * Duplicates every shift assignment + floor mapping from `from_date` onto
 * `to_date`. Skips users that already have a shift on `to_date`
 * (the (user_id, shift_date) UNIQUE constraint enforces this).
 *
 * Returns { copied, skipped, shifts: [...] }.
 */
export const POST = handle(async (req) => {
  const user = await requireRole("ifo_admin", "system_admin");
  const body = (await req.json()) as CopyBody;

  if (!body?.from_date || !body?.to_date) {
    throw new ApiError("VALIDATION", "from_date and to_date are required");
  }

  const supabase = await createClient();

  // Pull source shifts + floors
  let q = supabase
    .from("checker_shifts")
    .select(
      `id, user_id, role, scheduled_start, scheduled_end, note,
       floors:checker_shift_floors(floor_number, building)`,
    )
    .eq("shift_date", body.from_date);
  if (body.role) q = q.eq("role", body.role);

  const { data: src, error: srcErr } = await q;
  if (srcErr) throw new ApiError("INTERNAL", srcErr.message);
  if (!src || src.length === 0) {
    return NextResponse.json({ copied: 0, skipped: 0, shifts: [] });
  }

  // Find existing shifts on the target date for these users
  const userIds = src.map((s) => s.user_id);
  const { data: existing } = await supabase
    .from("checker_shifts")
    .select("user_id")
    .eq("shift_date", body.to_date)
    .in("user_id", userIds);
  const taken = new Set((existing ?? []).map((r) => r.user_id));

  // Insert clones for users who don't already have a shift on `to_date`
  type FloorIn = { floor_number: number; building: string | null };
  type SourceShift = {
    user_id: string;
    role: "checker" | "guard";
    scheduled_start: string;
    scheduled_end: string;
    note: string | null;
    floors: FloorIn[];
  };

  const candidates = (src as unknown as SourceShift[]).filter((s) => !taken.has(s.user_id));
  if (candidates.length === 0) {
    return NextResponse.json({ copied: 0, skipped: src.length, shifts: [] });
  }

  const { data: inserted, error: insErr } = await supabase
    .from("checker_shifts")
    .insert(
      candidates.map((s) => ({
        user_id: s.user_id,
        role: s.role,
        shift_date: body.to_date,
        scheduled_start: s.scheduled_start,
        scheduled_end: s.scheduled_end,
        assigned_by: user.id,
        note: s.note,
      })),
    )
    .select("id, user_id");
  if (insErr) throw new ApiError("INTERNAL", insErr.message);

  // Floor rows for each new shift
  const floorRows: Array<{ shift_id: string; floor_number: number; building: string | null }> = [];
  for (const shift of inserted ?? []) {
    const sourceShift = candidates.find((s) => s.user_id === shift.user_id);
    if (!sourceShift) continue;
    for (const f of sourceShift.floors) {
      floorRows.push({ shift_id: shift.id, floor_number: f.floor_number, building: f.building });
    }
  }
  if (floorRows.length > 0) {
    const { error: fErr } = await supabase.from("checker_shift_floors").insert(floorRows);
    if (fErr) throw new ApiError("INTERNAL", fErr.message);
  }

  await auditLog({
    event_type: "USER_PROVISIONED",
    actor_id: user.id,
    target_type: "shift",
    payload: {
      action: "copy_shifts",
      from_date: body.from_date,
      to_date: body.to_date,
      copied: inserted?.length ?? 0,
      skipped: src.length - (inserted?.length ?? 0),
    },
    ip_address: getClientIp(req),
  });

  return NextResponse.json({
    copied: inserted?.length ?? 0,
    skipped: src.length - (inserted?.length ?? 0),
    shifts: inserted ?? [],
  });
});
