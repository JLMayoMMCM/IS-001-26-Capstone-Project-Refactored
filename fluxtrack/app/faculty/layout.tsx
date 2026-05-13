import AppShell from "@/components/layout/app-shell";
import DemoBanner from "@/components/demo/demo-banner";

export default function FacultyLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell role="faculty">
      <DemoBanner />
      {children}
    </AppShell>
  );
}
