import AppShell from "@/components/layout/app-shell";
import { isDemoMode } from "@/lib/auth/config";
import DemoBanner from "@/components/demo/demo-banner";

export default function IFOLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell role="ifo_admin" demoMode={isDemoMode()}>
      <DemoBanner />
      {children}
    </AppShell>
  );
}
