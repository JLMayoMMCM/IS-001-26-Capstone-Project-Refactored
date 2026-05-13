import AppShell from "@/components/layout/app-shell";
import { isDemoMode } from "@/lib/auth/config";
import DemoBanner from "@/components/demo/demo-banner";

export default function CheckerLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell role="checker" demoMode={isDemoMode()}>
      <DemoBanner />
      {children}
    </AppShell>
  );
}
