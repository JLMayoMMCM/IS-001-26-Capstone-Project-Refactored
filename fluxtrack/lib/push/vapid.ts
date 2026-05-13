export type WebPushSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  expirationTime?: number | null;
};

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  reference_id?: string | null;
  reference_type?: string | null;
  data?: Record<string, unknown>;
};

export function isValidSubscription(input: unknown): input is WebPushSubscription {
  if (!input || typeof input !== "object") return false;
  const o = input as Record<string, unknown>;
  if (typeof o.endpoint !== "string" || !o.endpoint.startsWith("https://")) return false;
  const k = o.keys as Record<string, unknown> | undefined;
  if (!k || typeof k.p256dh !== "string" || typeof k.auth !== "string") return false;
  return true;
}

// VAPID send is implemented by the push-send edge function. Here we provide
// a server-side stub that POSTs to the edge function with the internal secret.
// If the edge function is not deployed, the call is logged and skipped.
export async function sendPush(sub: WebPushSubscription, payload: PushPayload): Promise<{ ok: boolean; status?: number; expired?: boolean }> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.INTERNAL_PUSH_SECRET;
  if (!base || !secret) {
    console.warn("[push] sendPush skipped: missing INTERNAL_PUSH_SECRET or NEXT_PUBLIC_SUPABASE_URL");
    return { ok: false };
  }
  try {
    const res = await fetch(`${base}/functions/v1/push-send`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-push-secret": secret,
      },
      body: JSON.stringify({ subscription: sub, payload }),
    });
    return { ok: res.ok, status: res.status, expired: res.status === 404 || res.status === 410 };
  } catch (e) {
    console.warn("[push] sendPush threw:", e);
    return { ok: false };
  }
}
