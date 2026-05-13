import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { handle, ApiError } from "@/lib/api/errors";
import { requireRole } from "@/lib/auth/get-session";

// GET /apis/admin/audit?event=&actor=&target_type=&from=&to=&limit=&offset=
export const GET = handle(async (req) => {
  await requireRole("system_admin", "hr_admin");
  const url = new URL(req.url);
  const event = url.searchParams.get("event");
  const actor = url.searchParams.get("actor");
  const targetType = url.searchParams.get("target_type");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "50"), 500);
  const offset = Math.max(Number(url.searchParams.get("offset") ?? "0"), 0);

  const svc = createServiceClient();
  let q = svc
    .from("audit_log")
    .select("*, actor:users!audit_log_actor_id_fkey(full_name,email,role)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (event) q = q.eq("event_type", event);
  if (actor) q = q.eq("actor_id", actor);
  if (targetType) q = q.eq("target_type", targetType);
  if (from) q = q.gte("created_at", from);
  if (to) q = q.lte("created_at", to);

  const { data, error, count } = await q;
  if (error) throw new ApiError("INTERNAL", error.message);
  return NextResponse.json({ events: data ?? [], total: count ?? 0, limit, offset });
});
