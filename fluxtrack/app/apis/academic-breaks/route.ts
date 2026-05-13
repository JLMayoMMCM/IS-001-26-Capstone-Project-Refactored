import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { handle, ApiError } from "@/lib/api/errors";
import { requireRole } from "@/lib/auth/get-session";
import { auditLog, getClientIp } from "@/lib/audit/log";

type Body = {
  term_id: string;
  date_from: string;
  date_to: string;
  label: string;
};

export const GET = handle(async (req) => {
  await requireRole("ifo_admin", "hr_admin", "system_admin", "faculty");
  const url = new URL(req.url);
  const termId = url.searchParams.get("term_id");
  const svc = createServiceClient();
  let q = svc
    .from("academic_breaks")
    .select("*")
    .eq("is_active", true)
    .order("date_from");
  if (termId) q = q.eq("term_id", termId);
  const { data, error } = await q;
  if (error) throw new ApiError("INTERNAL", error.message);
  return NextResponse.json({ breaks: data ?? [] });
});

export const POST = handle(async (req) => {
  const user = await requireRole("ifo_admin", "system_admin");
  const body = (await req.json()) as Body;
  if (!body?.term_id || !body?.date_from || !body?.date_to || !body?.label) {
    throw new ApiError("VALIDATION", "term_id, date_from, date_to, label are required");
  }
  if (body.date_to < body.date_from) {
    throw new ApiError("VALIDATION", "date_to must be >= date_from");
  }

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("academic_breaks")
    .insert({
      term_id: body.term_id,
      date_from: body.date_from,
      date_to: body.date_to,
      label: body.label,
    })
    .select()
    .single();
  if (error) throw new ApiError("INTERNAL", error.message);

  await auditLog({
    event_type: "academic_break.created",
    actor_id: user.id,
    target_type: "academic_break",
    target_id: data.id,
    payload: { label: data.label, term_id: data.term_id },
    ip_address: getClientIp(req),
  });

  return NextResponse.json({ break: data }, { status: 201 });
});
