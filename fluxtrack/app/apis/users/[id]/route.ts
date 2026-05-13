import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { handle, ApiError } from "@/lib/api/errors";
import { requireRole } from "@/lib/auth/get-session";
import { auditLog, getClientIp } from "@/lib/audit/log";
import type { TablesUpdate } from "@/types/database.types";

type Ctx = { params: Promise<{ id: string }> };
type UserPatch = Partial<{
  role: "faculty" | "ifo_admin" | "checker" | "guard" | "hr_admin" | "system_admin";
  full_name: string;
  department: string;
  employment_type: "full_time" | "part_time";
  faculty_id: string | null;
  is_active: boolean;
}>;

export const GET = handle(async (_req, ctx) => {
  await requireRole("system_admin", "ifo_admin", "hr_admin");
  const { id } = await (ctx as Ctx).params;
  const supabase = await createClient();
  const { data, error } = await supabase.from("users").select("*").eq("id", id).single();
  if (error) throw new ApiError("NOT_FOUND");
  return NextResponse.json({ user: data });
});

/**
 * POST /api/users/[id] — patch user (System Admin only).
 * `is_active=false` is the deactivation path — auth.users sign-in remains
 * possible until the proxy checks `is_active` (out of scope for v1).
 */
export const POST = handle(async (req, ctx) => {
  const actor = await requireRole("system_admin");
  const { id } = await (ctx as Ctx).params;
  const patch = (await req.json()) as UserPatch;

  const updates: TablesUpdate<"users"> = { ...patch };
  if (Object.keys(updates).length === 0) throw new ApiError("VALIDATION", "no fields to update");

  const admin = createAdminClient();
  const { data, error } = await admin.from("users").update(updates).eq("id", id).select().single();
  if (error) throw new ApiError("INTERNAL", error.message);

  await auditLog({
    event_type: patch.is_active === false ? "USER_DEACTIVATED" : "USER_PROVISIONED",
    actor_id: actor.id,
    target_type: "user",
    target_id: id,
    payload: patch as unknown as Record<string, import("@/types/database.types").Json>,
    ip_address: getClientIp(req),
  });

  return NextResponse.json({ user: data });
});
