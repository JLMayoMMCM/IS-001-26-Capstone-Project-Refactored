import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { handle, ApiError } from "@/lib/api/errors";
import { requireRole } from "@/lib/auth/get-session";

/**
 * GET /api/hr/summary
 *
 * Aggregate stats for the HR Dashboard metric cards over a date range.
 *
 * Query params:
 *   ?date_from=YYYY-MM-DD
 *   ?date_to=YYYY-MM-DD
 *   ?dept=Faculty department
 *
 * Returns:
 *   {
 *     total_records,
 *     total_hours,            // sum of duration_minutes / 60 for completed sessions
 *     modality_drift_pct,     // % of sessions where modality_override = true
 *     drift_session_count,    // raw count of sessions with modality_override
 *     no_show_count,          // sessions in (absent, checker_flagged)
 *     compliance_pct,         // (records - no_show) / records * 100
 *     by_modality: { f2f, blended, online },
 *     by_status:   Record<status, number>,
 *     daily_hours: [{ day: 'Mon'|..., hours, target }],   // last 5 working days
 *   }
 */
export const GET = handle(async (req) => {
  await requireRole("hr_admin", "system_admin", "ifo_admin");
  const url = new URL(req.url);
  const dateFrom = url.searchParams.get("date_from");
  const dateTo = url.searchParams.get("date_to");
  const dept = url.searchParams.get("dept");

  const supabase = await createClient();

  type Row = {
    session_date: string;
    status: string;
    actual_modality: string | null;
    duration_minutes: number | null;
    modality_override: boolean;
  };
  // Cast through unknown — the view isn't in generated types
  let q = (supabase as unknown as { from: (t: string) => { select: (s: string) => unknown } })
    .from("hr_session_records")
    .select("session_date, status, actual_modality, duration_minutes, modality_override") as unknown as {
      gte: (col: string, v: string) => typeof q;
      lte: (col: string, v: string) => typeof q;
      eq: (col: string, v: string) => typeof q;
      then: <T>(cb: (r: { data: Row[] | null; error: { message: string } | null }) => T) => Promise<T>;
    };

  if (dateFrom) q = q.gte("session_date", dateFrom);
  if (dateTo) q = q.lte("session_date", dateTo);
  if (dept) q = q.eq("faculty_department", dept);

  const { data, error } = await (q as unknown as Promise<{ data: Row[] | null; error: { message: string } | null }>);
  if (error) throw new ApiError("INTERNAL", error.message);

  const rows = data ?? [];
  const total = rows.length;
  const completed = rows.filter((r) => r.status === "completed" || r.status === "early_end" || r.status === "overstay");
  const noShow = rows.filter((r) => r.status === "absent" || r.status === "checker_flagged");
  const totalMinutes = completed.reduce((sum, r) => sum + (r.duration_minutes ?? 0), 0);
  const driftRows = rows.filter((r) => r.modality_override);

  const byModality = { f2f: 0, blended: 0, online: 0 };
  for (const r of completed) {
    if (r.actual_modality === "f2f") byModality.f2f++;
    else if (r.actual_modality === "blended") byModality.blended++;
    else if (r.actual_modality === "online") byModality.online++;
  }

  const byStatus: Record<string, number> = {};
  for (const r of rows) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;

  // Daily hours for last 7 calendar days
  const now = new Date();
  const dailyMap = new Map<string, number>();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    dailyMap.set(d.toISOString().slice(0, 10), 0);
  }
  for (const r of completed) {
    if (dailyMap.has(r.session_date)) {
      dailyMap.set(r.session_date, (dailyMap.get(r.session_date) ?? 0) + (r.duration_minutes ?? 0) / 60);
    }
  }
  const dailyHours = Array.from(dailyMap.entries()).map(([date, hours]) => {
    const day = new Date(date).toLocaleDateString("en-US", { weekday: "short" });
    return { date, day, hours: Math.round(hours * 10) / 10, target: 40 };
  });

  return NextResponse.json({
    total_records: total,
    total_hours: Math.round((totalMinutes / 60) * 10) / 10,
    modality_drift_pct: total > 0 ? Math.round((driftRows.length / total) * 1000) / 10 : 0,
    drift_session_count: driftRows.length,
    no_show_count: noShow.length,
    compliance_pct: total > 0 ? Math.round(((total - noShow.length) / total) * 1000) / 10 : 0,
    by_modality: byModality,
    by_status: byStatus,
    daily_hours: dailyHours,
  });
});
