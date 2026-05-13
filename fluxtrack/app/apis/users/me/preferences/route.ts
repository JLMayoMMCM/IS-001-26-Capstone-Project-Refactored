import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { handle, ApiError } from "@/lib/api/errors";
import { getCurrentUser } from "@/lib/auth/get-session";
import { auditLog, getClientIp } from "@/lib/audit/log";

type Channel = { push: boolean; in_app: boolean };
type Prefs = Record<string, Channel>;

const ALLOWED_KEYS = new Set([
  "extension_request",
  "extension_result",
  "ghost_alerts",
  "late_hold_expiring",
  "dispute_updates",
  "schedule_changes",
  "assist_acknowledged",
  "session_force_ended",
  "schedule_moved",
  "schedule_archived",
]);

function validate(input: unknown): Prefs {
  if (!input || typeof input !== "object") {
    throw new ApiError("VALIDATION", "preferences must be an object");
  }
  const prefs = input as Record<string, unknown>;
  const out: Prefs = {};
  for (const [key, val] of Object.entries(prefs)) {
    if (!ALLOWED_KEYS.has(key)) continue;
    if (!val || typeof val !== "object") {
      throw new ApiError("VALIDATION", `preferences.${key} must be an object`);
    }
    const entry = val as Record<string, unknown>;
    const push = entry.push;
    const inApp = "in_app" in entry ? entry.in_app : entry.email;
    if (typeof push !== "boolean" || typeof inApp !== "boolean") {
      throw new ApiError("VALIDATION", `preferences.${key}.push and .in_app must be booleans`);
    }
    out[key] = { push, in_app: inApp };
  }
  return out;
}

// GET /apis/users/me/preferences — current user's notification preferences.
// Aggregates rows from public.notification_preferences into a flat record.
export const GET = handle(async () => {
  const user = await getCurrentUser();
  const svc = createServiceClient();
  const { data, error } = await svc
    .from("notification_preferences")
    .select("event_type, push_enabled, in_app_enabled")
    .eq("user_id", user.id);
  if (error) throw new ApiError("INTERNAL", error.message);
  const out: Prefs = {};
  for (const row of data ?? []) {
    out[row.event_type] = { push: row.push_enabled, in_app: row.in_app_enabled };
  }
  return NextResponse.json({ preferences: out });
});

// PUT /apis/users/me/preferences — upsert preferences for the current user.
export const PUT = handle(async (req) => {
  const user = await getCurrentUser();
  const body = (await req.json()) as { preferences?: unknown };
  const cleaned = validate(body?.preferences);

  const svc = createServiceClient();
  const rows = Object.entries(cleaned).map(([event_type, ch]) => ({
    user_id: user.id,
    event_type,
    push_enabled: ch.push,
    in_app_enabled: ch.in_app,
  }));

  if (rows.length > 0) {
    const { error } = await svc
      .from("notification_preferences")
      .upsert(rows, { onConflict: "user_id,event_type" });
    if (error) throw new ApiError("INTERNAL", error.message);
  }

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
