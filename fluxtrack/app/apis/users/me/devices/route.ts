import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { handle, ApiError } from "@/lib/api/errors";
import { getCurrentUser } from "@/lib/auth/get-session";
import { auditLog, getClientIp } from "@/lib/audit/log";

const ALLOWED_TYPES = new Set(["laptop", "tablet", "phone", "desktop", "other"]);

type CreateBody = {
  name?: unknown;
  mac_hint?: unknown;
  device_type?: unknown;
  is_primary?: unknown;
};

function validateName(value: unknown): string {
  if (typeof value !== "string") throw new ApiError("VALIDATION", "name must be a string");
  const trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > 64) {
    throw new ApiError("VALIDATION", "name must be 1–64 characters");
  }
  return trimmed;
}

function validateMacHint(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new ApiError("VALIDATION", "mac_hint must be a string");
  if (value.length > 32) throw new ApiError("VALIDATION", "mac_hint too long");
  return value.trim();
}

type DeviceType = "laptop" | "tablet" | "phone" | "desktop" | "other";
function validateType(value: unknown): DeviceType {
  if (value === undefined || value === null) return "laptop";
  if (typeof value !== "string" || !ALLOWED_TYPES.has(value)) {
    throw new ApiError("VALIDATION", "device_type must be one of: laptop, tablet, phone, desktop, other");
  }
  return value as DeviceType;
}

export const GET = handle(async () => {
  const user = await getCurrentUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_devices")
    .select("id, name, mac_hint, device_type, is_primary, is_active, last_seen_at, created_at")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) throw new ApiError("INTERNAL", error.message);
  return NextResponse.json({ devices: data ?? [] });
});

export const POST = handle(async (req) => {
  const user = await getCurrentUser();
  const body = (await req.json()) as CreateBody;

  const name = validateName(body.name);
  const mac_hint = validateMacHint(body.mac_hint);
  const device_type = validateType(body.device_type);
  const is_primary = body.is_primary === true;

  const supabase = await createClient();

  if (is_primary) {
    const { error: clearErr } = await supabase
      .from("user_devices")
      .update({ is_primary: false })
      .eq("user_id", user.id)
      .eq("is_active", true);
    if (clearErr) throw new ApiError("INTERNAL", clearErr.message);
  }

  const { data, error } = await supabase
    .from("user_devices")
    .insert({
      user_id: user.id,
      name,
      mac_hint,
      device_type,
      is_primary,
      last_seen_at: new Date().toISOString(),
    })
    .select("id, name, mac_hint, device_type, is_primary, is_active, last_seen_at, created_at")
    .single();

  if (error) throw new ApiError("INTERNAL", error.message);

  await auditLog({
    event_type: "DEVICE_REGISTERED",
    actor_id: user.id,
    target_type: "user_device",
    target_id: data.id,
    payload: { name, device_type, is_primary },
    ip_address: getClientIp(req),
  });

  return NextResponse.json({ device: data }, { status: 201 });
});
