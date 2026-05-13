import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { handle, ApiError } from "@/lib/api/errors";
import { getCurrentUser, requireRole } from "@/lib/auth/get-session";
import { auditLog, getClientIp } from "@/lib/audit/log";

type ShiftBody = {
  user_id: string;
  role: "checker" | "guard";
  shift_date: string; // YYYY-MM-DD
  scheduled_start: string; // HH:MM
  scheduled_end: string;   // HH:MM
  floors: Array<{ floor_number: number; building?: string }>;
  note?: string;
};

/** GET /api/checker/shifts?date=YYYY-MM-DD&role=checker|guard */
export const GET = handle(async (req) => {
  const me = await getCurrentUser();
  const url = new URL(req.url);
  const date = url.searchParams.get("date");
  const role = url.searchParams.get("role");

  const supabase = await createClient();
  let q = supabase
    .from("checker_shifts")
    .select(
      `*, user:users!checker_shifts_user_id_fkey(full_name, email),
       floors:checker_shift_floors(floor_number, building)`,
    )
    .order("shift_date", { ascending: false });

  if (date) q = q.eq("shift_date", date);
  if (role) q = q.eq("role", role as "checker" | "guard");

  const { data, error } = await q;
  if (error) throw new ApiError("INTERNAL", error.message);

  // Checker/guard sees only their own
  const filtered = ["checker", "guard"].includes(me.role)
    ? (data ?? []).filter((s) => s.user_id === me.id)
    : (data ?? []);

  return NextResponse.json({ shifts: filtered });
});

/** POST /api/checker/shifts — IFO Admin assigns a shift with floors */
export const POST = handle(async (req) => {
  const user = await requireRole("ifo_admin", "system_admin");
  const body = (await req.json()) as ShiftBody;

  if (!body?.user_id || !body?.role || !body?.shift_date || !body?.scheduled_start || !body?.scheduled_end) {
    throw new ApiError("VALIDATION", "user_id, role, shift_date, scheduled_start, scheduled_end required");
  }
  if (!Array.isArray(body.floors) || body.floors.length === 0) {
    throw new ApiError("VALIDATION", "floors must be a non-empty array");
  }

  const supabase = await createClient();

  // Upsert shift (UNIQUE on user_id + shift_date)
  const { data: shift, error: shiftErr } = await supabase
    .from("checker_shifts")
    .upsert({
      user_id: body.user_id,
      role: body.role,
      shift_date: body.shift_date,
      scheduled_start: body.scheduled_start,
      scheduled_end: body.scheduled_end,
      assigned_by: user.id,
      note: body.note ?? null,
    }, { onConflict: "user_id,shift_date" })
    .select()
    .single();

  if (shiftErr) throw new ApiError("INTERNAL", shiftErr.message);

  // Replace floors
  await supabase.from("checker_shift_floors").delete().eq("shift_id", shift.id);
  const floorRows = body.floors.map((f) => ({
    shift_id: shift.id,
    floor_number: f.floor_number,
    building: f.building ?? null,
  }));
  const { error: fErr } = await supabase.from("checker_shift_floors").insert(floorRows);
  if (fErr) throw new ApiError("INTERNAL", fErr.message);

  await auditLog({
    event_type: "USER_PROVISIONED", // closest existing event for shift assignment
    actor_id: user.id,
    target_type: "shift",
    target_id: shift.id,
    payload: {
      user_id: body.user_id,
      role: body.role,
      shift_date: body.shift_date,
      floors: body.floors,
    },
    ip_address: getClientIp(req),
  });

  return NextResponse.json({ shift }, { status: 201 });
});
