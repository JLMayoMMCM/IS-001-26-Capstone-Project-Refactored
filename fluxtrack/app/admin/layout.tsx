import AppShell from "@/components/layout/app-shell";
import DemoBanner from "@/components/demo/demo-banner";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell role="system_admin">
      <DemoBanner />
      {children}
    </AppShell>
  );
}
