import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { handle, ApiError } from "@/lib/api/errors";
import { requireRole } from "@/lib/auth/get-session";

// GET /apis/admin/jobs — read cron.job rows for the FluxTrack jobs.
// Requires the `pg_cron` extension and SELECT grants on cron.job to service role.
export const GET = handle(async () => {
  await requireRole("system_admin");
  const svc = createServiceClient();
  // Use rpc-via-sql via .from() doesn't work for `cron.job`; use rest by calling a wrapped view
  // if available, otherwise return a graceful 200 with an empty list + hint.
  const { data, error } = await svc
    .schema("cron" as never)
    .from("job" as never)
    .select("jobid,schedule,command,jobname,active")
    .order("jobname" as never);
  if (error) {
    return NextResponse.json({
      jobs: [],
      note: "cron schema not accessible from service role; query `select * from cron.job` in SQL editor.",
      detail: error.message,
    });
  }
  return NextResponse.json({ jobs: data ?? [] });
});
