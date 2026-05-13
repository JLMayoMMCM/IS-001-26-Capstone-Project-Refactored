import AppShell from "@/components/layout/app-shell";
import { isDemoMode } from "@/lib/auth/config";
import DemoBanner from "@/components/demo/demo-banner";

export default function GuardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell role="guard" demoMode={isDemoMode()}>
      <DemoBanner />
      {children}
    </AppShell>
  );
}
