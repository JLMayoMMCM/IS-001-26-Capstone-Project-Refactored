import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { handle, ApiError } from "@/lib/api/errors";
import { getCurrentUser } from "@/lib/auth/get-session";

type Ctx = { params: Promise<{ id: string }> };

const TTL_SECONDS = 60; // NFR-07: 60s signed URL TTL

/**
 * GET /api/photos/[id]/signed-url
 * id is a session_id. Returns a 60s signed URL for that session's photo,
 * if the caller is authorized:
 *   - faculty owner
 *   - ifo_admin / hr_admin / system_admin (all sessions)
 *   - checker (same-floor sessions today)
 */
export const GET = handle(async (_req, ctx) => {
  const user = await getCurrentUser();
  const { id: sessionId } = await (ctx as Ctx).params;

  const supabase = await createClient();
  const { data: session, error } = await supabase
    .from("sessions")
    .select(
      `id, faculty_id, photo_storage_path, photo_submitted, photo_submitted_at, session_date,
       room:rooms(floor_number)`,
    )
    .eq("id", sessionId)
    .single();

  if (error || !session) throw new ApiError("NOT_FOUND", "Session not found");
  if (!session.photo_storage_path) {
    throw new ApiError("NOT_FOUND", session.photo_submitted ? "Photo purged (>30d retention)" : "No photo on this session");
  }

  // Authorization
  const role = user.role;
  let allowed = false;
  if (role === "ifo_admin" || role === "hr_admin" || role === "system_admin") allowed = true;
  else if (role === "faculty" && session.faculty_id === user.id) allowed = true;
  else if (role === "checker") {
    const sessionFloor = (session as unknown as { room: { floor_number: number } | null }).room?.floor_number;
    const today = new Date().toISOString().slice(0, 10);
    if (sessionFloor != null && session.session_date === today) {
      const { data: floors } = await supabase
        .from("checker_shift_floors")
        .select("floor_number, shift:checker_shifts!inner(user_id, shift_date)")
        .eq("shift.user_id", user.id)
        .eq("shift.shift_date", today);
      if (floors?.some((f) => f.floor_number === sessionFloor)) allowed = true;
    }
  }
  if (!allowed) throw new ApiError("FORBIDDEN", "You are not authorized to view this photo");

  const admin = createAdminClient();
  const { data: signed, error: signErr } = await admin.storage
    .from("session-photos")
    .createSignedUrl(session.photo_storage_path, TTL_SECONDS);

  if (signErr || !signed?.signedUrl) {
    throw new ApiError("INTERNAL", `Could not sign URL: ${signErr?.message}`);
  }

  return NextResponse.json({
    signed_url: signed.signedUrl,
    expires_in: TTL_SECONDS,
    submitted_at: session.photo_submitted_at,
  });
});
