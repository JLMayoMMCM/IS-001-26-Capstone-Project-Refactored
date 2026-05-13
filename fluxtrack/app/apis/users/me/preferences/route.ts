import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { handle, ApiError } from "@/lib/api/errors";
import { getCurrentUser } from "@/lib/auth/get-session";
import { auditLog, getClientIp } from "@/lib/audit/log";

type Channel = { push: boolean; email: boolean };
type Prefs = Record<string, Channel>;

const ALLOWED_KEYS = new Set([
  "extension_request",
  "extension_result",
  "ghost_alerts",
  "late_hold_expiring",
  "dispute_updates",
  "schedule_changes",
]);

function validate(input: unknown): Prefs {
  if (!input || typeof input !== "object") {
    throw new ApiError("VALIDATION", "preferences must be an object");
  }
  const prefs = input as Record<string, unknown>;
  const out: Prefs = {};
  for (const [key, val] of Object.entries(prefs)) {
    if (!ALLOWED_KEYS.has(key)) continue; // silently drop unknown keys
    if (!val || typeof val !== "object") {
      throw new ApiError("VALIDATION", `preferences.${key} must be an object`);
    }
    const entry = val as Record<string, unknown>;
    if (typeof entry.push !== "boolean" || typeof entry.email !== "boolean") {
      throw new ApiError("VALIDATION", `preferences.${key}.push and .email must be booleans`);
    }
    out[key] = { push: entry.push, email: entry.email };
  }
  return out;
}

/**
 * GET  /api/users/me/preferences  — current user's notification preferences
 * PUT  /api/users/me/preferences  — replace the preferences blob
 */
export const GET = handle(async () => {
  const user = await getCurrentUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("users")
    .select("notification_preferences")
    .eq("id", user.id)
    .single();
  if (error) throw new ApiError("INTERNAL", error.message);
  return NextResponse.json({ preferences: data?.notification_preferences ?? {} });
});

export const PUT = handle(async (req) => {
  const user = await getCurrentUser();
  const body = (await req.json()) as { preferences?: unknown };
  const cleaned = validate(body?.preferences);

  const supabase = await createClient();
  const { error } = await supabase
    .from("users")
    .update({ notification_preferences: cleaned })
    .eq("id", user.id);

  if (error) throw new ApiError("INTERNAL", error.message);

  await auditLog({
    event_type: "USER_PREFERENCES_UPDATED",
    actor_id: user.id,
    target_type: "user",
    target_id: user.id,
    payload: { keys: Object.keys(cleaned) },
    ip_address: getClientIp(req),
  });

  return NextResponse.json({ preferences: cleaned });
});
