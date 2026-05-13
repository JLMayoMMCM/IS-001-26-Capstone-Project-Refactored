import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { handle, ApiError } from "@/lib/api/errors";
import { getCurrentUser } from "@/lib/auth/get-session";
import { auditLog, getClientIp } from "@/lib/audit/log";
import type { TablesUpdate } from "@/types/database.types";

const ALLOWED_TYPES = new Set(["laptop", "tablet", "phone", "desktop", "other"]);

type PatchBody = {
  name?: unknown;
  mac_hint?: unknown;
  device_type?: unknown;
  is_primary?: unknown;
};

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handle(async (req, ctx) => {
  const { id } = await (ctx as Ctx).params;
  const user = await getCurrentUser();
  const body = (await req.json()) as PatchBody;

  const update: TablesUpdate<"user_devices"> = {};

  if (body.name !== undefined) {
    if (typeof body.name !== "string") throw new ApiError("VALIDATION", "name must be a string");
    const trimmed = body.name.trim();
    if (trimmed.length < 1 || trimmed.length > 64) {
      throw new ApiError("VALIDATION", "name must be 1–64 characters");
    }
    update.name = trimmed;
  }
  if (body.mac_hint !== undefined) {
    if (body.mac_hint === null || body.mac_hint === "") {
      update.mac_hint = null;
    } else if (typeof body.mac_hint === "string" && body.mac_hint.length <= 32) {
      update.mac_hint = body.mac_hint.trim();
    } else {
      throw new ApiError("VALIDATION", "mac_hint invalid");
    }
  }
  if (body.device_type !== undefined) {
    if (typeof body.device_type !== "string" || !ALLOWED_TYPES.has(body.device_type)) {
      throw new ApiError("VALIDATION", "device_type invalid");
    }
    update.device_type = body.device_type;
  }
  if (body.is_primary !== undefined) {
    update.is_primary = body.is_primary === true;
  }

  if (Object.keys(update).length === 0) {
    throw new ApiError("VALIDATION", "no fields to update");
  }

  const supabase = await createClient();

  const { data: existing, error: fetchErr } = await supabase
    .from("user_devices")
    .select("id, user_id, is_active")
    .eq("id", id)
    .single();
  if (fetchErr || !existing) throw new ApiError("NOT_FOUND", "device not found");
  if (existing.user_id !== user.id) throw new ApiError("FORBIDDEN", "not your device");

  if (update.is_primary === true) {
    const { error: clearErr } = await supabase
      .from("user_devices")
      .update({ is_primary: false })
      .eq("user_id", user.id)
      .eq("is_active", true)
      .neq("id", id);
    if (clearErr) throw new ApiError("INTERNAL", clearErr.message);
  }

  const { data, error } = await supabase
    .from("user_devices")
    .update(update)
    .eq("id", id)
    .select("id, name, mac_hint, device_type, is_primary, is_active, last_seen_at, created_at")
    .single();

  if (error) throw new ApiError("INTERNAL", error.message);

  await auditLog({
    event_type: "DEVICE_UPDATED",
    actor_id: user.id,
    target_type: "user_device",
    target_id: id,
    payload: { fields: Object.keys(update) },
    ip_address: getClientIp(req),
  });

  return NextResponse.json({ device: data });
});

export const DELETE = handle(async (req, ctx) => {
  const { id } = await (ctx as Ctx).params;
  const user = await getCurrentUser();
  const supabase = await createClient();

  const { data: existing, error: fetchErr } = await supabase
    .from("user_devices")
    .select("id, user_id, name")
    .eq("id", id)
    .single();
  if (fetchErr || !existing) throw new ApiError("NOT_FOUND", "device not found");
  if (existing.user_id !== user.id) throw new ApiError("FORBIDDEN", "not your device");

  const { error } = await supabase
    .from("user_devices")
    .update({ is_active: false, is_primary: false })
    .eq("id", id);

  if (error) throw new ApiError("INTERNAL", error.message);

  await auditLog({
    event_type: "DEVICE_REMOVED",
    actor_id: user.id,
    target_type: "user_device",
    target_id: id,
    payload: { name: existing.name },
    ip_address: getClientIp(req),
  });

  return NextResponse.json({ ok: true });
});
