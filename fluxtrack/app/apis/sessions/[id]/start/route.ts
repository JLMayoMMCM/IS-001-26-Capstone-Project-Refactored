import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { handle, ApiError } from "@/lib/api/errors";
import { getCurrentUser } from "@/lib/auth/get-session";
import { auditLog, getClientIp } from "@/lib/audit/log";
import { hashTeamsLink, isValidTeamsLink, requiresPhoto, requiresTeamsLink, type Modality } from "@/lib/utils/modality";
import { canStart } from "@/lib/utils/session-status";
import { nowUtc } from "@/lib/utils/date";

type StartBody = {
  modality: Modality;
  photo_storage_path?: string;
  teams_link?: string;
  self_declared_on_campus?: boolean;
  wlan_on_campus?: boolean | null;
};

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/sessions/[id]/start — Faculty starts a class session.
 * Validates modality requirements (photo, Teams link), WLAN/self-declaration,
 * and session state. Sets actual_start, status → active.
 */
export const POST = handle(async (req, ctx) => {
  const user = await getCurrentUser();
  const { id } = await (ctx as Ctx).params;
  const body = (await req.json()) as StartBody;

  if (!body?.modality) throw new ApiError("VALIDATION", "modality is required");

  const supabase = await createClient();

  const { data: existing, error: loadErr } = await supabase
    .from("sessions")
    .select("id, faculty_id, status, schedule_id, room_id, session_date")
    .eq("id", id)
    .single();

  if (loadErr || !existing) throw new ApiError("NOT_FOUND", "Session not found");
  if (existing.faculty_id !== user.id) throw new ApiError("SESSION_NOT_OWNED");
  if (!canStart(existing.status)) {
    throw new ApiError("SESSION_NOT_ACTIVE", `Cannot start a session in status '${existing.status}'`);
  }

  if (requiresPhoto(body.modality) && !body.photo_storage_path) throw new ApiError("PHOTO_REQUIRED");
  if (requiresTeamsLink(body.modality) && !body.teams_link)     throw new ApiError("TEAMS_LINK_REQUIRED");
  if (body.teams_link && !isValidTeamsLink(body.teams_link))     throw new ApiError("INVALID_TEAMS_LINK");

  const { data: schedule } = await supabase
    .from("schedules")
    .select("scheduled_modality")
    .eq("id", existing.schedule_id)
    .single();

  const modalityOverride = !!schedule && schedule.scheduled_modality !== body.modality;
  const teams_link_hash = body.teams_link ? hashTeamsLink(body.teams_link) : null;
  const startedAt = nowUtc();

  const { data: updated, error: upErr } = await supabase
    .from("sessions")
    .update({
      status: "active",
      actual_modality: body.modality,
      modality_override: modalityOverride,
      wlan_on_campus: body.wlan_on_campus ?? null,
      self_declared_on_campus: !!body.self_declared_on_campus,
      photo_storage_path: body.photo_storage_path ?? null,
      photo_submitted: !!body.photo_storage_path,
      photo_submitted_at: body.photo_storage_path ? startedAt : null,
      teams_link_hash,
      actual_start: startedAt,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (upErr || !updated) throw new ApiError("INTERNAL", upErr?.message ?? "Failed to update session");

  await auditLog({
    event_type: "SESSION_STARTED",
    actor_id: user.id,
    target_type: "session",
    target_id: id,
    payload: {
      modality: body.modality,
      modality_override: modalityOverride,
      wlan_on_campus: body.wlan_on_campus ?? null,
      self_declared_on_campus: !!body.self_declared_on_campus,
    },
    ip_address: getClientIp(req),
  });

  return NextResponse.json({ session: updated });
});
