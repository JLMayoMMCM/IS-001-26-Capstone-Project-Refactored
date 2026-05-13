import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { handle, ApiError } from "@/lib/api/errors";
import { requireRole } from "@/lib/auth/get-session";
import { auditLog, getClientIp } from "@/lib/audit/log";
import type { SectionsUpdate } from "@/lib/supabase/types";

type PatchBody = {
  program?: string | null;
  year_level?: number | null;
  student_count?: number;
  is_active?: boolean;
};
type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req, ctx) => {
  await requireRole("ifo_admin", "hr_admin", "system_admin", "faculty");
  const { id } = await (ctx as Ctx).params;
  const svc = createServiceClient();
  const { data, error } = await svc
    .from("sections")
    .select("*, academic_terms(code,name,term_start_date,term_end_date)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new ApiError("INTERNAL", error.message);
  if (!data) throw new ApiError("NOT_FOUND", "Section not found");
  return NextResponse.json({ section: data });
});

export const PATCH = handle(async (req, ctx) => {
  const user = await requireRole("ifo_admin", "system_admin");
  const { id } = await (ctx as Ctx).params;
  const body = (await req.json()) as PatchBody;

  const update: SectionsUpdate = {};
  if (body.program !== undefined) update.program = body.program;
  if (body.year_level !== undefined) update.year_level = body.year_level;
  if (body.student_count !== undefined) update.student_count = body.student_count;
  if (body.is_active !== undefined) update.is_active = body.is_active;
  if (Object.keys(update).length === 0) {
    throw new ApiError("VALIDATION", "No fields to update");
  }

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("sections")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new ApiError("INTERNAL", error.message);

  await auditLog({
    event_type: body.is_active === false ? "section.deactivated" : "section.updated",
    actor_id: user.id,
    target_type: "section",
    target_id: id,
    payload: update,
    ip_address: getClientIp(req),
  });

  return NextResponse.json({ section: data });
});

export const DELETE = handle(async (req, ctx) => {
  // Soft delete via is_active = false; hard delete only when no schedules reference it.
  const user = await requireRole("ifo_admin", "system_admin");
  const { id } = await (ctx as Ctx).params;

  const svc = createServiceClient();
  const { data: refs } = await svc
    .from("schedules")
    .select("id")
    .eq("section_id", id)
    .limit(1);

  if (refs && refs.length > 0) {
    // Deactivate instead of hard-delete
    const { data, error } = await svc
      .from("sections")
      .update({ is_active: false })
      .eq("id", id)
      .select()
      .single();
    if (error) throw new ApiError("INTERNAL", error.message);
    await auditLog({
      event_type: "section.deactivated",
      actor_id: user.id,
      target_type: "section",
      target_id: id,
      payload: { soft: true },
      ip_address: getClientIp(req),
    });
    return NextResponse.json({ section: data, soft: true });
  }

  const { error } = await svc.from("sections").delete().eq("id", id);
  if (error) throw new ApiError("INTERNAL", error.message);
  await auditLog({
    event_type: "section.deactivated",
    actor_id: user.id,
    target_type: "section",
    target_id: id,
    payload: { hard: true },
    ip_address: getClientIp(req),
  });
  return NextResponse.json({ ok: true });
});
