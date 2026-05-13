import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { ROLES, isDemoMode, type Role } from "@/lib/auth/config";

// Demo-only: returns the seeded users for the current role so the topbar
// account switcher can list them. Outside demo mode this 404s — we don't
// want to expose a public user list on the live deployment.
export async function GET(req: Request) {
  if (!isDemoMode()) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const url = new URL(req.url);
  const role = url.searchParams.get("role");
  if (!role || !(ROLES as string[]).includes(role)) {
    return NextResponse.json({ users: [] });
  }

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("users")
    .select("id, full_name, email, department")
    .eq("role", role as Role)
    .eq("is_active", true)
    .order("full_name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ users: data ?? [] });
}
