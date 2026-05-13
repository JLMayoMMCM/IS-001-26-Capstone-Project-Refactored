import AppShell from "@/components/layout/app-shell";
import { isDemoMode } from "@/lib/auth/config";
import DemoBanner from "@/components/demo/demo-banner";

export default function FacultyLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell role="faculty" demoMode={isDemoMode()}>
      <DemoBanner />
      {children}
    </AppShell>
  );
}
