import { ApiError } from "@/lib/api/errors";
import { getCurrentUser as getCurrentUserBase, type CurrentUser } from "./server";
import type { Role } from "./config";

export class UnauthenticatedError extends ApiError {
  constructor(message = "Authentication required") {
    super("UNAUTHORIZED", message);
  }
}

export async function getCurrentUser(): Promise<CurrentUser> {
  const u = await getCurrentUserBase();
  if (!u) throw new UnauthenticatedError();
  if (!u.is_active) throw new ApiError("FORBIDDEN", "Account is inactive");
  return u;
}

export async function requireRole(...roles: Role[]): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (roles.length === 0) return u;
  if (roles.includes(u.role) || u.role === "system_admin") return u;
  throw new ApiError("FORBIDDEN", `Requires role: ${roles.join("|")}`);
}

export type { CurrentUser };
