import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { handle, ApiError } from "@/lib/api/errors";
import { sendPush, isValidSubscription, type PushPayload, type WebPushSubscription } from "@/lib/push/vapid";

type PushBody = {
  recipient_ids: string[];
  payload: PushPayload;
  /** When true, also create in-app `notifications` rows. */
  create_inapp?: boolean;
  event_type?: string;
};

/**
 * POST /api/notifications/push
 *
 * Service-role-only endpoint, called by:
 *   - DB triggers (via pg_net.http_post in Phase 11 SQL)
 *   - Edge Functions
 *   - Internal API routes (assists, en-route, etc.) for fan-out
 *
 * Auth: requires `x-internal-secret` header matching INTERNAL_PUSH_SECRET env.
 * Falls back to allowing requests from server-side service-role context.
 */
export const POST = handle(async (req) => {
  const secret = req.headers.get("x-internal-secret");
  const expected = process.env.INTERNAL_PUSH_SECRET;
  if (!expected || secret !== expected) {
    throw new ApiError("FORBIDDEN", "invalid or missing x-internal-secret");
  }

  const body = (await req.json()) as PushBody;
  if (!Array.isArray(body?.recipient_ids) || body.recipient_ids.length === 0) {
    throw new ApiError("VALIDATION", "recipient_ids required");
  }
  if (!body?.payload?.title || !body?.payload?.body) {
    throw new ApiError("VALIDATION", "payload.title and payload.body required");
  }

  const admin = createAdminClient();

  // Fetch all recipients' push subscriptions
  const { data: recipients } = await admin
    .from("users")
    .select("id, push_subscription")
    .in("id", body.recipient_ids);

  let pushed = 0;
  let expired = 0;
  let inappCreated = 0;
  const expiredIds: string[] = [];

  for (const r of recipients ?? []) {
    const sub = r.push_subscription;
    if (sub && isValidSubscription(sub)) {
      const result = await sendPush(sub as WebPushSubscription, body.payload);
      if (result.ok) pushed++;
      else if (result.expired) {
        expired++;
        expiredIds.push(r.id);
      }
    }
  }

  // Clean up dead subscriptions
  if (expiredIds.length > 0) {
    await admin.from("users").update({ push_subscription: null }).in("id", expiredIds);
  }

  // Create in-app notifications too (default true so the feed always reflects)
  if (body.create_inapp !== false) {
    const rows = body.recipient_ids.map((id) => ({
      recipient_id: id,
      event_type: body.event_type ?? body.payload.tag ?? "GENERIC",
      title: body.payload.title,
      body: body.payload.body,
      reference_id: body.payload.reference_id ?? null,
      reference_type: body.payload.reference_type ?? null,
      delivered_via: ("both" as const),
    }));
    const { error: insErr, count } = await admin.from("notifications").insert(rows, { count: "exact" });
    if (!insErr) inappCreated = count ?? rows.length;
  }

  return NextResponse.json({
    pushed,
    expired,
    inapp_created: inappCreated,
    recipients: recipients?.length ?? 0,
  });
});
