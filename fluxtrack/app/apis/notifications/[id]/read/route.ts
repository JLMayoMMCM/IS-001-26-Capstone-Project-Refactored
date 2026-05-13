import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { handle, ApiError } from "@/lib/api/errors";
import { getCurrentUser } from "@/lib/auth/get-session";
import { nowUtc } from "@/lib/utils/date";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle(async (_req, ctx) => {
  const user = await getCurrentUser();
  const { id } = await (ctx as Ctx).params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("notifications")
    .update({ read_at: nowUtc() })
    .eq("id", id)
    .eq("recipient_id", user.id)
    .select()
    .single();

  if (error) throw new ApiError("NOT_FOUND");
  return NextResponse.json({ notification: data });
});
