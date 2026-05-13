import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { handle, ApiError } from "@/lib/api/errors";
import { requireRole } from "@/lib/auth/get-session";
import { auditLog, getClientIp } from "@/lib/audit/log";

type Body = { job: "materialize_sessions" | "photo_cleanup" | "export_cleanup"; horizon_days?: number };

// POST /apis/admin/jobs/run — ad-hoc trigger of a known job (BR-SYS-5).
export const POST = handle(async (req) => {
  const user = await requireRole("system_admin");
  const body = (await req.json()) as Body;
  if (!body?.job) throw new ApiError("VALIDATION", "job is required");

  const svc = createServiceClient();
  let result: unknown = null;

  if (body.job === "materialize_sessions") {
    const { data, error } = await svc.rpc("fn_materialize_sessions", {
      p_horizon_days: body.horizon_days ?? 14,
    });
    if (error) throw new ApiError("INTERNAL", error.message);
    result = { inserted: data };
  } else if (body.job === "photo_cleanup" || body.job === "export_cleanup") {
    // Trigger the corresponding Supabase Edge Function over HTTP.
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!base) throw new ApiError("INTERNAL", "NEXT_PUBLIC_SUPABASE_URL not set");
    const res = await fetch(`${base}/functions/v1/${body.job.replace("_", "-")}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
    result = { status: res.status, ok: res.ok };
  } else {
    throw new ApiError("VALIDATION", `unknown job: ${body.job as string}`);
  }

  await auditLog({
    event_type: "admin.job_run",
    actor_id: user.id,
    target_type: "job",
    target_id: null,
    payload: { job: body.job, result },
    ip_address: getClientIp(req),
  });

  return NextResponse.json({ ok: true, job: body.job, result });
});
