import { headers } from "next/headers";
import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export type AuditEvent = {
  event_type: string;
  actor_id?: string | null;
  target_type?: string | null;
  target_id?: string | null;
  payload?: Record<string, unknown> | null;
  ip_address?: string | null;
};

export async function auditLog(event: AuditEvent): Promise<void> {
  try {
    const svc = createServiceClient();
    await svc.from("audit_log").insert({
      event_type: event.event_type,
      actor_id: event.actor_id ?? null,
      target_type: event.target_type ?? null,
      target_id: event.target_id ?? null,
      payload: (event.payload ?? null) as never,
      ip_address: event.ip_address ?? null,
    });
  } catch (e) {
    // Audit must never break the calling action; just log.
    console.warn("[audit] failed to write:", e);
  }
}

export function getClientIp(req: NextRequest | Request): string | null {
  const hdrs = (req as NextRequest).headers ?? (req as Request).headers;
  const xff = hdrs.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const real = hdrs.get("x-real-ip");
  if (real) return real;
  return null;
}

export async function getClientIpFromHeaders(): Promise<string | null> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0].trim() ?? h.get("x-real-ip") ?? null;
}
