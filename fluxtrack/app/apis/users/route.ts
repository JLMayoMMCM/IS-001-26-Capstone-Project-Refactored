import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { handle, ApiError } from "@/lib/api/errors";
import { requireRole } from "@/lib/auth/get-session";
import { auditLog, getClientIp } from "@/lib/audit/log";

type UserBody = {
  email: string;
  full_name: string;
  role: "faculty" | "ifo_admin" | "checker" | "guard" | "hr_admin" | "system_admin";
  faculty_id?: string;
  department?: string;
  employment_type?: "full_time" | "part_time";
};

/** GET /api/users — list all (system_admin only) or filtered by role */
export const GET = handle(async (req) => {
  await requireRole("system_admin", "ifo_admin", "hr_admin");
  const url = new URL(req.url);
  const role = url.searchParams.get("role");
  const active = url.searchParams.get("active");

  const supabase = await createClient();
  let q = supabase.from("users").select("*").order("full_name");
  if (role) q = q.eq("role", role as never);
  if (active === "true") q = q.eq("is_active", true);
  if (active === "false") q = q.eq("is_active", false);

  const { data, error } = await q;
  if (error) throw new ApiError("INTERNAL", error.message);
  return NextResponse.json({ users: data ?? [] });
});

/**
 * POST /api/users — System Admin provisions a new user.
 *
 * Creates an auth.users row via the Admin API; the `tg_auth_user_created`
 * trigger copies the row into public.users with role='faculty'. We then
 * UPDATE public.users with the actual role + profile fields.
 */
export const POST = handle(async (req) => {
  const actor = await requireRole("system_admin");
  const body = (await req.json()) as UserBody;

  if (!body?.email || !body?.full_name || !body?.role) {
    throw new ApiError("VALIDATION", "email, full_name, role required");
  }
  if (!body.email.toLowerCase().endsWith("@mmcm.edu.ph")) {
    // Soft warning; full enforcement is Phase 12
    console.warn("[users.create] non-MMCM email:", body.email);
  }

  const admin = createAdminClient();

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: body.email,
    email_confirm: true,
    user_metadata: { name: body.full_name, oid: `manual-${Date.now()}` },
  });

  if (createErr || !created?.user) {
    if (createErr?.message?.includes("already registered")) {
      throw new ApiError("VALIDATION", "Email already registered");
    }
    throw new ApiError("INTERNAL", createErr?.message ?? "Auth user create failed");
  }

  // The trigger inserts the row with role='faculty'; update with the chosen role + profile
  const { data: updated, error: upErr } = await admin
    .from("users")
    .update({
      role: body.role,
      full_name: body.full_name,
      faculty_id: body.faculty_id ?? null,
      department: body.department ?? null,
      employment_type: body.employment_type ?? null,
    })
    .eq("id", created.user.id)
    .select()
    .single();

  if (upErr) throw new ApiError("INTERNAL", upErr.message);

  await auditLog({
    event_type: "USER_PROVISIONED",
    actor_id: actor.id,
    target_type: "user",
    target_id: created.user.id,
    payload: { email: body.email, role: body.role, department: body.department ?? null },
    ip_address: getClientIp(req),
  });

  return NextResponse.json({ user: updated }, { status: 201 });
});
