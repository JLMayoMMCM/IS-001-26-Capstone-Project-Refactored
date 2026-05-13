import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { handle, ApiError } from "@/lib/api/errors";
import { requireRole } from "@/lib/auth/get-session";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req, ctx) => {
  await requireRole("hr_admin", "system_admin", "ifo_admin");
  const { id } = await (ctx as Ctx).params;
  const supabase = await createClient();

  const [period, counts, openDisputes] = await Promise.all([
    supabase.from("payroll_periods").select("*").eq("id", id).single(),
    supabase.from("sessions").select("status", { count: "exact", head: false }).eq("payroll_period_id", id),
    supabase
      .from("disputes")
      .select("id, session:sessions!disputes_session_id_fkey(payroll_period_id)", { count: "exact", head: false })
      .eq("status", "pending"),
  ]);

  if (period.error) throw new ApiError("NOT_FOUND");

  // Aggregate status counts
  const breakdown: Record<string, number> = {};
  for (const r of counts.data ?? []) breakdown[r.status] = (breakdown[r.status] ?? 0) + 1;

  // Filter open disputes that point to sessions in this period
  const openInPeriod = (openDisputes.data ?? []).filter(
    (d) => (d as unknown as { session: { payroll_period_id: string } | null }).session?.payroll_period_id === id,
  ).length;

  return NextResponse.json({
    period: period.data,
    breakdown,
    open_disputes: openInPeriod,
  });
});
