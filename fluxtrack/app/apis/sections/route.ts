import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { handle, ApiError } from "@/lib/api/errors";
import { requireRole } from "@/lib/auth/get-session";
import { auditLog, getClientIp } from "@/lib/audit/log";

type Body = {
  academic_term_id: string;
  section_code: string;
  program?: string | null;
  year_level?: number | null;
  student_count?: number;
};

export const GET = handle(async (req) => {
  await requireRole("ifo_admin", "hr_admin", "system_admin", "faculty");
  const url = new URL(req.url);
  const termId = url.searchParams.get("term_id");
  const activeOnly = url.searchParams.get("active") !== "0";

  const svc = createServiceClient();
  // PostgREST auto-resolves the FK from sections.academic_term_id → academic_terms(id).
  let q = svc
    .from("sections")
    .select("*, academic_terms(code,name)")
    .order("section_code");
  if (termId) q = q.eq("academic_term_id", termId);
  if (activeOnly) q = q.eq("is_active", true);

  const { data, error } = await q;
  if (error) throw new ApiError("INTERNAL", error.message);
  return NextResponse.json({ sections: data ?? [] });
});

export const POST = handle(async (req) => {
  const user = await requireRole("ifo_admin", "system_admin");
  const body = (await req.json()) as Body;
  if (!body?.academic_term_id || !body?.section_code) {
    throw new ApiError("VALIDATION", "academic_term_id and section_code are required");
  }
  if (body.section_code.length > 40) {
    throw new ApiError("VALIDATION", "section_code too long");
  }

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("sections")
    .insert({
      academic_term_id: body.academic_term_id,
      section_code: body.section_code.trim(),
      program: body.program ?? null,
      year_level: body.year_level ?? null,
      student_count: body.student_count ?? 0,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new ApiError("CONFLICT", "Section code already exists in this term");
    }
    throw new ApiError("INTERNAL", error.message);
  }

  await auditLog({
    event_type: "section.created",
    actor_id: user.id,
    target_type: "section",
    target_id: data.id,
    payload: { section_code: data.section_code, academic_term_id: data.academic_term_id },
    ip_address: getClientIp(req),
  });

  return NextResponse.json({ section: data }, { status: 201 });
});
