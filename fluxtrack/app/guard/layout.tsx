import AppShell from "@/components/layout/app-shell";
import DemoBanner from "@/components/demo/demo-banner";

export default function GuardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell role="guard">
      <DemoBanner />
      {children}
    </AppShell>
  );
}
