import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/server";
import { roleHomePath } from "@/lib/auth/config";

export default async function HomePage() {
  const u = await getCurrentUser();
  if (u) redirect(roleHomePath(u.role));
  redirect("/auth/login");
}
