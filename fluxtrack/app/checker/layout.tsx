import AppShell from "@/components/layout/app-shell";
import DemoBanner from "@/components/demo/demo-banner";

export default function CheckerLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell role="checker">
      <DemoBanner />
      {children}
    </AppShell>
  );
}
