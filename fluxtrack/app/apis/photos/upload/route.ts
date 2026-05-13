import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { handle, ApiError } from "@/lib/api/errors";
import { getCurrentUser } from "@/lib/auth/get-session";
import { auditLog } from "@/lib/audit/log";

const MAX_BYTES = 5 * 1024 * 1024; // 5MB (NFR-03)
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * POST /api/photos/upload  (multipart/form-data)
 *   - file: required image (jpeg/png/webp, ≤5MB)
 *   - session_id: required UUID — caller must own the session, status not terminal
 *
 * Uses the service-role admin client to bypass storage RLS. Returns the
 * storage path which the caller stores on the session row (start endpoint).
 */
export const POST = handle(async (req) => {
  const user = await getCurrentUser();

  const form = await req.formData();
  const file = form.get("file");
  const sessionId = form.get("session_id");

  if (!sessionId || typeof sessionId !== "string") {
    throw new ApiError("VALIDATION", "session_id is required");
  }
  if (!file || !(file instanceof File)) {
    throw new ApiError("VALIDATION", "file is required");
  }
  if (file.size > MAX_BYTES) throw new ApiError("FILE_TOO_LARGE", `Max ${MAX_BYTES / 1024 / 1024}MB`);
  if (!ALLOWED_TYPES.has(file.type)) throw new ApiError("INVALID_FILE_TYPE", `Got ${file.type}`);

  // Authz: only the session owner may upload its photo
  const supabase = await createClient();
  const { data: session, error: loadErr } = await supabase
    .from("sessions")
    .select("id, faculty_id, status")
    .eq("id", sessionId)
    .single();

  if (loadErr || !session) throw new ApiError("NOT_FOUND", "Session not found");
  if (session.faculty_id !== user.id) throw new ApiError("SESSION_NOT_OWNED");
  if (session.status === "completed" || session.status === "early_end" || session.status === "absent") {
    throw new ApiError("SESSION_NOT_ACTIVE", "Cannot upload photo to a closed session");
  }

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const objectPath = `sessions/${sessionId}/${crypto.randomUUID()}.${ext}`;

  const admin = createAdminClient();
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await admin.storage
    .from("session-photos")
    .upload(objectPath, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (upErr) throw new ApiError("INTERNAL", `Upload failed: ${upErr.message}`);

  await auditLog({
    event_type: "SESSION_STARTED", // photo upload is a step within session start
    actor_id: user.id,
    target_type: "session",
    target_id: sessionId,
    payload: { phase: "photo_uploaded", storage_path: objectPath, bytes: file.size, mime: file.type },
  });

  return NextResponse.json({ storage_path: objectPath });
});
