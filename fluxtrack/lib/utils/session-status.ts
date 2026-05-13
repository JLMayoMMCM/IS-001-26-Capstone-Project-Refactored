import type { SessionStatus } from "@/lib/supabase/types";

// Tunables — should ultimately come from system_settings. Defaults mirror BR-FAC-*.
export const CHECKIN_WINDOW_BEFORE_MIN = 10;
export const CHECKIN_WINDOW_AFTER_MIN = 15;
export const EN_ROUTE_GRACE_MIN = 30;
export const EARLY_END_THRESHOLD_MIN = 15;
export const COURTESY_WINDOW_MIN = 5;
export const EXTENSION_WINDOW_MIN = 5;
export const EXT_MAX_NO_INCOMING = 30;
export const EXT_MAX_WITH_INCOMING = 15;

export function canStart(status: SessionStatus): boolean {
  return status === "scheduled" || status === "pending" || status === "en_route";
}

export function canEnd(status: SessionStatus): boolean {
  return status === "active";
}

export function canDeclareEnRoute(status: SessionStatus): boolean {
  return status === "scheduled" || status === "pending";
}

export function canRequestExtension(status: SessionStatus): boolean {
  return status === "active";
}
