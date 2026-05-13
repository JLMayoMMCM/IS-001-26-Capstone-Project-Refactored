import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { handle, ApiError } from "@/lib/api/errors";
import { getCurrentUser } from "@/lib/auth/get-session";

/** GET /api/notifications — paginated in-app feed for current user. */
export const GET = handle(async (req) => {
  const user = await getCurrentUser();
  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 200);
  const unreadOnly = url.searchParams.get("unread") === "true";

  const supabase = await createClient();
  let q = supabase
    .from("notifications")
    .select("*")
    .eq("recipient_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (unreadOnly) q = q.is("read_at", null);

  const { data, error } = await q;
  if (error) throw new ApiError("INTERNAL", error.message);
  return NextResponse.json({ notifications: data ?? [] });
});
