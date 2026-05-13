import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { handle, ApiError } from "@/lib/api/errors";
import { getCurrentUser } from "@/lib/auth/get-session";
import { isValidSubscription } from "@/lib/push/vapid";

/**
 * POST /api/notifications/subscribe
 * Body: PushSubscription JSON (from `pushManager.subscribe()`)
 *
 * Stored on `users.push_subscription`. One subscription per user — re-subscribing
 * overwrites the previous one (browsers can only have one active anyway).
 */
export const POST = handle(async (req) => {
  const user = await getCurrentUser();
  const sub = await req.json();

  if (!isValidSubscription(sub)) {
    throw new ApiError("VALIDATION", "invalid push subscription shape");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("users")
    .update({ push_subscription: sub as never })
    .eq("id", user.id);
  if (error) throw new ApiError("INTERNAL", error.message);

  return NextResponse.json({ ok: true });
});

/** DELETE /api/notifications/subscribe — remove subscription (logout etc.). */
export const DELETE = handle(async () => {
  const user = await getCurrentUser();
  const supabase = await createClient();
  await supabase.from("users").update({ push_subscription: null }).eq("id", user.id);
  return NextResponse.json({ ok: true });
});
