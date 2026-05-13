import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { handle, ApiError } from "@/lib/api/errors";
import { requireRole } from "@/lib/auth/get-session";
import { auditLog, getClientIp } from "@/lib/audit/log";

type ValueType = "integer" | "boolean" | "string" | "minutes" | "hours" | "enum";

type Body = {
  updates: Array<{ key: string; value: unknown; value_type?: ValueType }>;
};

function validateValue(value: unknown, type?: ValueType) {
  if (!type) return;
  switch (type) {
    case "integer":
    case "minutes":
    case "hours":
      if (typeof value !== "number" || !Number.isInteger(value)) {
        throw new ApiError("VALIDATION", `value for ${type} must be an integer`);
      }
      return;
    case "boolean":
      if (typeof value !== "boolean") throw new ApiError("VALIDATION", "value must be boolean");
      return;
    case "string":
    case "enum":
      if (typeof value !== "string") throw new ApiError("VALIDATION", "value must be string");
      return;
  }
}

export const GET = handle(async () => {
  await requireRole("system_admin");
  const svc = createServiceClient();
  const { data, error } = await svc
    .from("system_settings")
    .select("*")
    .order("key");
  if (error) throw new ApiError("INTERNAL", error.message);
  return NextResponse.json({ settings: data ?? [] });
});

export const PATCH = handle(async (req) => {
  const user = await requireRole("system_admin");
  const body = (await req.json()) as Body;
  if (!Array.isArray(body?.updates) || body.updates.length === 0) {
    throw new ApiError("VALIDATION", "updates[] required");
  }

  const svc = createServiceClient();
  for (const u of body.updates) {
    if (!u.key) throw new ApiError("VALIDATION", "key is required");
    validateValue(u.value, u.value_type);
    const { error } = await svc
      .from("system_settings")
      .update({
        value: { v: u.value },
        updated_by: user.id,
      })
      .eq("key", u.key);
    if (error) throw new ApiError("INTERNAL", error.message);
  }

  await auditLog({
    event_type: "settings.updated",
    actor_id: user.id,
    target_type: "system_settings",
    payload: { keys: body.updates.map((u) => u.key) },
    ip_address: getClientIp(req),
  });

  const { data } = await svc.from("system_settings").select("*").order("key");
  return NextResponse.json({ settings: data ?? [] });
});
