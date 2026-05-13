"use client";

import { useRouter } from "next/navigation";
import { DEMO_COOKIE_NAME, ROLES, ROLE_LABEL, roleHomePath, isDemoMode, type Role } from "@/lib/auth/config";

export default function RoleSwitcher({ current }: { current?: Role }) {
  const router = useRouter();
  if (!isDemoMode()) return null;

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
