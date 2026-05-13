import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { handle, ApiError } from "@/lib/api/errors";
import { requireRole } from "@/lib/auth/get-session";

/**
 * GET /api/hr/records
 *
 * Query params:
 *   ?date_from=YYYY-MM-DD
 *   ?date_to=YYYY-MM-DD
 *   ?status=completed|early_end|absent|...
 *   ?dept=CCIS|...
 *   ?lock_stage=none|soft|hard|archived
 *   ?q=  (faculty name/email substring)
 *   ?limit=50  (max 500)
 *   ?offset=0
 *
 * Returns paginated records from the hr_session_records view.
 */
export const GET = handle(async (req) => {
  await requireRole("hr_admin", "system_admin", "ifo_admin");
  const url = new URL(req.url);

  const dateFrom = url.searchParams.get("date_from");
  const dateTo   = url.searchParams.get("date_to");
  const status   = url.searchParams.get("status");
  const dept     = url.searchParams.get("dept");
  const lock     = url.searchParams.get("lock_stage");
  const q        = url.searchParams.get("q");
  const limit    = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 500);
  const offset   = Math.max(0, parseInt(url.searchParams.get("offset") ?? "0", 10) || 0);

  const supabase = await createClient();
  // View not in generated types yet — cast through any for the view-specific call
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = (supabase as any)
    .from("hr_session_records")
    .select("*", { count: "exact" })
    .order("session_date", { ascending: false })
    .order("scheduled_start", { ascending: true })
    .range(offset, offset + limit - 1);

  if (dateFrom) query = query.gte("session_date", dateFrom);
  if (dateTo)   query = query.lte("session_date", dateTo);
  if (status)   query = query.eq("status", status);
  if (dept)     query = query.eq("faculty_department", dept);
  if (lock)     query = query.eq("lock_stage", lock);
  if (q)        query = query.or(`faculty_name.ilike.%${q}%,faculty_email.ilike.%${q}%`);

  const { data, error, count } = await query as { data: Array<Record<string, unknown>> | null; error: { message: string } | null; count: number | null };
  if (error) throw new ApiError("INTERNAL", error.message);

  return NextResponse.json({
    records: data ?? [],
    total: count ?? 0,
    limit,
    offset,
  });
});
