import AppShell from "@/components/layout/app-shell";
import DemoBanner from "@/components/demo/demo-banner";

export default function HRLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell role="hr_admin">
      <DemoBanner />
      {children}
    </AppShell>
  );
}
