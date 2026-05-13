import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";
import { DEMO_COOKIE_NAME, DEMO_USER_COOKIE_NAME, isDemoMode, ROLES, type Role } from "./config";
import { fallbackDemoUser } from "./demo-data";
import type { CurrentUser } from "./types";
import type { Database } from "@/lib/supabase/types";

type UserRow = Database["public"]["Tables"]["users"]["Row"];

export type { CurrentUser };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function rowToUser(row: UserRow): CurrentUser {
  return {
    id: row.id,
    email: row.email,
    full_name: row.full_name,
    role: row.role,
    faculty_id: row.faculty_id,
    department: row.department,
    is_active: row.is_active,
  };
}

export async function readDemoRole(): Promise<Role> {
  const jar = await cookies();
  const raw = jar.get(DEMO_COOKIE_NAME)?.value;
  if (raw && (ROLES as string[]).includes(raw)) return raw as Role;
  return "faculty";
}

export async function readDemoUserId(): Promise<string | null> {
  const jar = await cookies();
  const raw = jar.get(DEMO_USER_COOKIE_NAME)?.value;
  return raw && UUID_RE.test(raw) ? raw : null;
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  if (isDemoMode()) {
    const role = await readDemoRole();
    const pinnedId = await readDemoUserId();
    const svc = createServiceClient();

    // Prefer the pinned user — but only if it still matches the active role
    // (operator may have switched roles since the user_id was set, leaving a
    // stale cookie). On any mismatch we silently fall back to first-of-role.
    if (pinnedId) {
      const { data } = await svc
        .from("users")
        .select("*")
        .eq("id", pinnedId)
        .eq("role", role)
        .eq("is_active", true)
        .maybeSingle();
      if (data) return rowToUser(data as UserRow);
    }

    const { data } = await svc
      .from("users")
      .select("*")
      .eq("role", role)
      .eq("is_active", true)
      .order("full_name")
      .limit(1)
      .maybeSingle();
    if (data) return rowToUser(data as UserRow);
    return fallbackDemoUser(role);
  }

  // Production: use the Supabase Auth session
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const auth = authData?.user;
  if (!auth) return null;

  const svc = createServiceClient();
  const { data } = await svc.from("users").select("*").eq("id", auth.id).maybeSingle();
  if (!data) return null;
  return rowToUser(data as UserRow);
}

export async function requireRole(...roles: Role[]): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) {
    throw new Response("Unauthorized", { status: 401 });
  }
  if (!u.is_active) {
    throw new Response("Account is inactive", { status: 403 });
  }
  if (roles.length > 0 && !roles.includes(u.role) && u.role !== "system_admin") {
    throw new Response("Forbidden", { status: 403 });
  }
  return u;
}
