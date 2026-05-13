import type { Role } from "./config";

export type CurrentUser = {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  faculty_id: string | null;
  department: string | null;
  is_active: boolean;
};
