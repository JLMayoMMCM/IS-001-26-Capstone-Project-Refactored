import { NextResponse } from "next/server";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function err(status: number, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...(extra ?? {}) }, { status });
}

export function notFound(message = "Not found") {
  return err(404, message);
}
export function badRequest(message = "Bad request", extra?: Record<string, unknown>) {
  return err(400, message, extra);
}
export function unprocessable(message = "Unprocessable", extra?: Record<string, unknown>) {
  return err(422, message, extra);
}
export function conflict(message = "Conflict", extra?: Record<string, unknown>) {
  return err(409, message, extra);
}
export function forbidden(message = "Forbidden") {
  return err(403, message);
}
export function unauthorized(message = "Unauthorized") {
  return err(401, message);
}

export async function handle(
  fn: () => Promise<NextResponse | Response>
): Promise<NextResponse | Response> {
  try {
    return await fn();
  } catch (e: unknown) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[api] unhandled", e);
    return err(500, msg);
  }
}
