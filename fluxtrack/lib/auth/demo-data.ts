import { isDemoMode, type Role } from "./config";
import type { CurrentUser } from "./types";

const FALLBACK_DEMO_USERS: Record<Role, CurrentUser> = {
  faculty: {
    id: "00000000-0000-0000-0000-000000000001",
    email: "demo.faculty@mmcm.edu.ph",
    full_name: "Demo Faculty",
    role: "faculty",
    faculty_id: "F-0001",
    department: "Computer Science",
    is_active: true,
  },
  ifo_admin: {
    id: "00000000-0000-0000-0000-000000000002",
    email: "demo.ifo@mmcm.edu.ph",
    full_name: "Demo IFO Admin",
    role: "ifo_admin",
    faculty_id: null,
    department: null,
    is_active: true,
  },
  checker: {
    id: "00000000-0000-0000-0000-000000000003",
    email: "demo.checker@mmcm.edu.ph",
    full_name: "Demo Checker",
    role: "checker",
    faculty_id: null,
    department: null,
    is_active: true,
  },
  guard: {
    id: "00000000-0000-0000-0000-000000000004",
    email: "demo.guard@mmcm.edu.ph",
    full_name: "Demo Guard",
    role: "guard",
    faculty_id: null,
    department: null,
    is_active: true,
  },
  hr_admin: {
    id: "00000000-0000-0000-0000-000000000005",
    email: "demo.hr@mmcm.edu.ph",
    full_name: "Demo HR Admin",
    role: "hr_admin",
    faculty_id: null,
    department: null,
    is_active: true,
  },
  system_admin: {
    id: "00000000-0000-0000-0000-000000000006",
    email: "demo.admin@mmcm.edu.ph",
    full_name: "Demo System Admin",
    role: "system_admin",
    faculty_id: null,
    department: null,
    is_active: true,
  },
};

export function fallbackDemoUser(role: Role): CurrentUser {
  if (!isDemoMode()) {
    throw new Error(
      "fallbackDemoUser() may only be called when NEXT_PUBLIC_DEMO_MODE=true",
    );
  }
  return FALLBACK_DEMO_USERS[role];
}
