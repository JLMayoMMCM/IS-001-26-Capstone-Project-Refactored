export type Role =
  | "faculty"
  | "ifo_admin"
  | "checker"
  | "guard"
  | "hr_admin"
  | "system_admin";

export const ROLES: Role[] = [
  "faculty",
  "ifo_admin",
  "checker",
  "guard",
  "hr_admin",
  "system_admin",
];

export const DEMO_COOKIE_NAME = "fluxtrack_demo_role";

export const ROLE_HOME_PATH: Record<Role, string> = {
  faculty: "/faculty/dashboard",
  ifo_admin: "/ifo/ifo-dashboard",
  checker: "/checker/checker-dashboard",
  guard: "/guard/guard-dashboard",
  hr_admin: "/hr/hr-dashboard",
  system_admin: "/admin/admin-users",
};

// Callable AND indexable: callsites use either roleHomePath(role) or roleHomePath[role].
type RoleHomePathHelper = ((r: Role) => string) & Record<Role, string>;
export const roleHomePath: RoleHomePathHelper = Object.assign(
  ((r: Role) => ROLE_HOME_PATH[r]) as RoleHomePathHelper,
  ROLE_HOME_PATH
);

export const ROUTE_ROLE_MAP: Record<string, Role[]> = {
  "/faculty": ["faculty", "system_admin"],
  "/ifo": ["ifo_admin", "system_admin"],
  "/checker": ["checker", "system_admin"],
  "/guard": ["guard", "system_admin"],
  "/hr": ["hr_admin", "system_admin"],
  "/admin": ["system_admin"],
};

export function rolesForPath(pathname: string): Role[] | null {
  for (const [prefix, roles] of Object.entries(ROUTE_ROLE_MAP)) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) return roles;
  }
  return null;
}

export const ROLE_LABEL: Record<Role, string> = {
  faculty: "Faculty",
  ifo_admin: "IFO Admin",
  checker: "Checker",
  guard: "Guard",
  hr_admin: "HR Admin",
  system_admin: "System Admin",
};

export const ROLE_ACCENT: Record<Role, string> = {
  faculty: "#114b9f",
  ifo_admin: "#7c3aed",
  checker: "#0891b2",
  guard: "#d97706",
  hr_admin: "#16a34a",
  system_admin: "#475569",
};

export function isDemoMode(): boolean {
  return process.env.NEXT_PUBLIC_DEMO_MODE === "true";
}
