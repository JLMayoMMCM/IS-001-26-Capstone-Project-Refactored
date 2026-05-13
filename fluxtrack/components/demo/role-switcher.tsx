"use client";

import { useRouter } from "next/navigation";
import { DEMO_COOKIE_NAME, ROLES, ROLE_LABEL, roleHomePath, type Role } from "@/lib/auth/config";

// `demoMode` is passed in by the parent (a server component) so this client
// component never inlines NEXT_PUBLIC_DEMO_MODE into its bundle.
export default function RoleSwitcher({
  current,
  demoMode,
}: {
  current?: Role;
  demoMode: boolean;
}) {
  const router = useRouter();
  if (!demoMode) return null;

  function switchTo(next: Role) {
    document.cookie = `${DEMO_COOKIE_NAME}=${next}; path=/; max-age=${60 * 60 * 24 * 365}`;
    router.push(roleHomePath[next]);
    router.refresh();
  }

  return (
    <select
      className="text-xs border border-slate-200 rounded-md px-2 py-1 bg-white"
      defaultValue={current ?? "faculty"}
      onChange={(e) => switchTo(e.target.value as Role)}
      aria-label="Demo role switcher"
    >
      {ROLES.map((r) => (
        <option key={r} value={r}>
          {ROLE_LABEL[r]}
        </option>
      ))}
    </select>
  );
}
