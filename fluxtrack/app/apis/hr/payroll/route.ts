import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { handle, ApiError } from "@/lib/api/errors";
import { requireRole } from "@/lib/auth/get-session";
import { auditLog, getClientIp } from "@/lib/audit/log";

type PeriodBody = { name: string; date_from: string; date_to: string };

export const GET = handle(async () => {
  await requireRole("hr_admin", "system_admin", "ifo_admin");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payroll_periods")
    .select("*")
    .order("date_from", { ascending: false });
  if (error) throw new ApiError("INTERNAL", error.message);
  return NextResponse.json({ periods: data ?? [] });
});

export const POST = handle(async (req) => {
  const user = await requireRole("hr_admin", "system_admin");
  const body = (await req.json()) as PeriodBody;
  if (!body?.name || !body?.date_from || !body?.date_to) {
    throw new ApiError("VALIDATION", "name, date_from, date_to required");
  }
  if (body.date_to < body.date_from) {
    throw new ApiError("VALIDATION", "date_to must be on or after date_from");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payroll_periods")
    .insert({
      name: body.name.trim(),
      date_from: body.date_from,
      date_to: body.date_to,
      created_by: user.id,
    })
    .select()
    .single();
  if (error) throw new ApiError("INTERNAL", error.message);

  // Auto-attach existing sessions in range to the period (for record_count)
  const { data: countSessions } = await supabase
    .from("sessions")
    .update({ payroll_period_id: data.id })
    .gte("session_date", body.date_from)
    .lte("session_date", body.date_to)
    .is("payroll_period_id", null)
    .select("id");

  if (countSessions && countSessions.length > 0) {
    await supabase
      .from("payroll_periods")
      .update({ record_count: countSessions.length })
      .eq("id", data.id);
  }

  await auditLog({
    event_type: "USER_PROVISIONED", // closest existing event
    actor_id: user.id,
    target_type: "payroll_period",
    target_id: data.id,
    payload: { name: body.name, range: `${body.date_from} → ${body.date_to}` },
    ip_address: getClientIp(req),
  });

  return NextResponse.json({ period: data }, { status: 201 });
});
