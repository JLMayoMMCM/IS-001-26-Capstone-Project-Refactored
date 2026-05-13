import { cookies } from "next/headers";
import { DEMO_COOKIE_NAME, isDemoMode, ROLE_LABEL, type Role } from "@/lib/auth/config";

export default async function DemoBanner() {
  if (!isDemoMode()) return null;
  const jar = await cookies();
  const role = (jar.get(DEMO_COOKIE_NAME)?.value as Role) ?? "faculty";
  return (
    <div className="bg-amber-100 border-b border-amber-200 text-amber-800 text-xs px-4 py-1.5 text-center">
      <span className="font-medium">Demo Mode</span> — signed in as {ROLE_LABEL[role] ?? role}.
      Switch roles via the top-bar role picker.
    </div>
  );
}
