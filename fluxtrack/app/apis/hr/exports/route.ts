import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { handle, ApiError } from "@/lib/api/errors";
import { requireRole } from "@/lib/auth/get-session";
import { auditLog, getClientIp } from "@/lib/audit/log";
import { addMinutesIso, nowUtc } from "@/lib/utils/date";

type ExportBody = {
  date_from: string;
  date_to: string;
  payroll_period_id?: string;
  format?: "csv";
  filter?: { status?: string; dept?: string };
};

const SOFT_LOCK_HOURS = 48;

/** GET /api/hr/exports — list previous exports */
export const GET = handle(async () => {
  await requireRole("hr_admin", "system_admin");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_exports")
    .select("*, exporter:users!hr_exports_exported_by_fkey(full_name)")
    .order("exported_at", { ascending: false });
  if (error) throw new ApiError("INTERNAL", error.message);
  return NextResponse.json({ exports: data ?? [] });
});

/**
 * POST /api/hr/exports — generate CSV, upload to bucket, soft-lock the period.
 * Returns signed URL (60s) + the export row.
 */
export const POST = handle(async (req) => {
  const user = await requireRole("hr_admin", "system_admin");
  const body = (await req.json()) as ExportBody;
  if (!body?.date_from || !body?.date_to) throw new ApiError("VALIDATION", "date_from, date_to required");
  if (body.date_to < body.date_from) throw new ApiError("VALIDATION", "date_to must be on or after date_from");

  const supabase = await createClient();

  // Pull records via the HR view (typed as `never` since view isn't in generated types yet)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = (supabase as any)
    .from("hr_session_records")
    .select("*")
    .gte("session_date", body.date_from)
    .lte("session_date", body.date_to)
    .order("session_date")
    .order("scheduled_start");
  if (body.filter?.status) q = q.eq("status", body.filter.status);
  if (body.filter?.dept)   q = q.eq("faculty_department", body.filter.dept);

  const { data: rows, error: qErr } = await q as { data: Array<Record<string, unknown>> | null; error: { message: string } | null };
  if (qErr) throw new ApiError("INTERNAL", qErr.message);

  const csv = toCsv(rows ?? []);
  const exportedAt = nowUtc();
  const objectPath = `exports/${body.date_from}_${body.date_to}_${crypto.randomUUID()}.csv`;

  // Upload CSV using service role (bucket is private, no authenticated write policy)
  const admin = createAdminClient();
  const { error: upErr } = await admin.storage
    .from("hr-exports")
    .upload(objectPath, new Blob([csv], { type: "text/csv" }), {
      contentType: "text/csv",
      upsert: false,
    });
  if (upErr) throw new ApiError("INTERNAL", `CSV upload failed: ${upErr.message}`);

  // Insert export row
  const { data: row, error: insErr } = await supabase
    .from("hr_exports")
    .insert({
      exported_by: user.id,
      payroll_period_id: body.payroll_period_id ?? null,
      date_from: body.date_from,
      date_to: body.date_to,
      format: "csv",
      record_count: rows?.length ?? 0,
      storage_path: objectPath,
      exported_at: exportedAt,
      filter_criteria: body.filter ?? null,
    })
    .select()
    .single();
  if (insErr) throw new ApiError("INTERNAL", insErr.message);

  // Soft-lock the period if specified and currently unlocked (BR-5)
  if (body.payroll_period_id) {
    const { data: period } = await supabase
      .from("payroll_periods")
      .select("lock_stage")
      .eq("id", body.payroll_period_id)
      .single();
    if (period?.lock_stage === "none") {
      await supabase
        .from("payroll_periods")
        .update({
          lock_stage: "soft",
          soft_locked_at: exportedAt,
          soft_lock_expires_at: addMinutesIso(exportedAt, SOFT_LOCK_HOURS * 60),
        })
        .eq("id", body.payroll_period_id);

      await auditLog({
        event_type: "PAYROLL_SOFT_LOCKED",
        actor_id: user.id,
        target_type: "payroll_period",
        target_id: body.payroll_period_id,
        payload: { triggered_by: "csv_export", export_id: row.id },
        ip_address: getClientIp(req),
      });
    }
  }

  // 60s signed URL for immediate download
  const { data: signed } = await admin.storage
    .from("hr-exports")
    .createSignedUrl(objectPath, 60);

  await auditLog({
    event_type: "USER_PROVISIONED", // closest existing event for HR_EXPORT
    actor_id: user.id,
    target_type: "hr_export",
    target_id: row.id,
    payload: { date_from: body.date_from, date_to: body.date_to, record_count: rows?.length ?? 0 },
    ip_address: getClientIp(req),
  });

  return NextResponse.json({
    export: row,
    signed_url: signed?.signedUrl ?? null,
    expires_in: 60,
  });
});

/** Minimal CSV writer — escapes quotes/newlines per RFC 4180. */
function toCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "string" ? v : String(v);
    if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.join(",")];
  for (const row of rows) lines.push(headers.map((h) => escape(row[h])).join(","));
  return lines.join("\r\n");
}
