import { NextResponse, type NextRequest } from "next/server";

export type ApiErrorCode =
  | "VALIDATION"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "UNAUTHORIZED"
  | "CONFLICT"
  | "INTERNAL"
  | "SESSION_NOT_OWNED"
  | "SESSION_NOT_ACTIVE"
  | "PHOTO_REQUIRED"
  | "TEAMS_LINK_REQUIRED"
  | "INVALID_TEAMS_LINK"
  | "ENROUTE_INVALID_STATE"
  | "EXTENSION_DUPLICATE"
  | "EXTENSION_OUT_OF_WINDOW"
  | "EXTENSION_OVER_CAP"
  | "DISPUTE_DUPLICATE"
  | "DISPUTE_PAST_DEADLINE"
  | "DISPUTE_EXPLANATION_TOO_SHORT"
  | "PAYROLL_LOCKED"
  | "PAYROLL_LOCK_INVARIANT"
  | "PAYROLL_OPEN_DISPUTES"
  | "SCHEDULE_HAS_SESSIONS"
  | "SCHEDULE_ARCHIVED"
  | "SCHEDULE_CONFLICT"
  | "SECTION_CONFLICT"
  | "SHIFT_NOT_ACTIVE"
  | "SHIFT_OUTSIDE_WINDOW"
  | "CNA_REASON_REQUIRED"
  | "ROOM_CONFLICT"
  | "BAD_REQUEST"
  | "BOOKING_CONFLICT"
  | "DEVICE_PRIMARY_CONFLICT"
  | "NOT_IMPLEMENTED"
  | "PERIOD_LOCKED"
  | "FILE_TOO_LARGE"
  | "INVALID_FILE_TYPE"
  | "EXTENSION_ALREADY_REQUESTED"
  | "EXTENSION_WINDOW_CLOSED";

const STATUS_FOR: Partial<Record<ApiErrorCode, number>> = {
  VALIDATION: 422,
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  UNAUTHORIZED: 401,
  CONFLICT: 409,
  INTERNAL: 500,
  SESSION_NOT_OWNED: 403,
  SESSION_NOT_ACTIVE: 409,
  PHOTO_REQUIRED: 422,
  TEAMS_LINK_REQUIRED: 422,
  INVALID_TEAMS_LINK: 422,
  ENROUTE_INVALID_STATE: 409,
  EXTENSION_DUPLICATE: 409,
  EXTENSION_OUT_OF_WINDOW: 409,
  EXTENSION_OVER_CAP: 422,
  DISPUTE_DUPLICATE: 409,
  DISPUTE_PAST_DEADLINE: 409,
  DISPUTE_EXPLANATION_TOO_SHORT: 422,
  PAYROLL_LOCKED: 409,
  PAYROLL_LOCK_INVARIANT: 409,
  PAYROLL_OPEN_DISPUTES: 409,
  SCHEDULE_HAS_SESSIONS: 409,
  SCHEDULE_ARCHIVED: 409,
  SCHEDULE_CONFLICT: 409,
  SECTION_CONFLICT: 409,
  SHIFT_NOT_ACTIVE: 409,
  SHIFT_OUTSIDE_WINDOW: 409,
  CNA_REASON_REQUIRED: 422,
  ROOM_CONFLICT: 409,
  BAD_REQUEST: 400,
  BOOKING_CONFLICT: 409,
  DEVICE_PRIMARY_CONFLICT: 409,
  NOT_IMPLEMENTED: 501,
  PERIOD_LOCKED: 409,
  FILE_TOO_LARGE: 413,
  INVALID_FILE_TYPE: 415,
  EXTENSION_ALREADY_REQUESTED: 409,
  EXTENSION_WINDOW_CLOSED: 409,
};

export class ApiError extends Error {
  code: ApiErrorCode;
  status: number;
  details?: Record<string, unknown>;
  constructor(code: ApiErrorCode, message?: string, details?: Record<string, unknown>) {
    super(message ?? code);
    this.code = code;
    this.status = STATUS_FOR[code] ?? 500;
    this.details = details;
  }
}

type Ctx = unknown;
type RouteHandler = (req: NextRequest, ctx: Ctx) => Promise<Response | NextResponse>;

export function handle(fn: RouteHandler): RouteHandler {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        return NextResponse.json(
          { error: { code: e.code, message: e.message, details: e.details } },
          { status: e.status }
        );
      }
      if (e instanceof Response) return e;
      const msg = e instanceof Error ? e.message : "Internal error";
      console.error("[api]", msg, e);
      return NextResponse.json({ error: { code: "INTERNAL", message: msg } }, { status: 500 });
    }
  };
}
