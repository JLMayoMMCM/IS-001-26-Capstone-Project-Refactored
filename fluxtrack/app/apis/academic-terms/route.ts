import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { handle, ApiError } from "@/lib/api/errors";
import { requireRole } from "@/lib/auth/get-session";
import { auditLog, getClientIp } from "@/lib/audit/log";

type Body = {
  code: string;
  name: string;
  term_start_date: string;
  term_end_date: string;
};

export const GET = handle(async () => {
  await requireRole("ifo_admin", "hr_admin", "system_admin", "faculty");
  const svc = createServiceClient();
  const { data, error } = await svc
    .from("academic_terms")
    .select("*")
    .order("term_start_date", { ascending: false });
  if (error) throw new ApiError("INTERNAL", error.message);
  return NextResponse.json({ terms: data ?? [] });
});

export const POST = handle(async (req) => {
  const user = await requireRole("ifo_admin", "system_admin");
  const body = (await req.json()) as Body;
  if (!body?.code || !body?.name || !body?.term_start_date || !body?.term_end_date) {
    throw new ApiError("VALIDATION", "code, name, term_start_date, term_end_date are required");
  }
  if (body.term_end_date < body.term_start_date) {
    throw new ApiError("VALIDATION", "term_end_date must be >= term_start_date");
  }

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("academic_terms")
    .insert({
      code: body.code,
      name: body.name,
      term_start_date: body.term_start_date,
      term_end_date: body.term_end_date,
    })
    .select()
    .single();
  if (error) {
    if (error.code === "23505") {
      throw new ApiError("CONFLICT", "Term code already exists");
    }
    throw new ApiError("INTERNAL", error.message);
  }

  await auditLog({
    event_type: "academic_term.created",
    actor_id: user.id,
    target_type: "academic_term",
    target_id: data.id,
    payload: { code: data.code },
    ip_address: getClientIp(req),
  });

  return NextResponse.json({ term: data }, { status: 201 });
});
