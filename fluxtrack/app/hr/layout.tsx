import AppShell from "@/components/layout/app-shell";
import { isDemoMode } from "@/lib/auth/config";
import DemoBanner from "@/components/demo/demo-banner";

export default function HRLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell role="hr_admin" demoMode={isDemoMode()}>
      <DemoBanner />
      {children}
    </AppShell>
  );
}
