import SidebarShell from "@/components/layout/sidebar-shell";
import type { SidebarGroup } from "@/components/layout/brand-sidebar";

const HR_GROUPS: SidebarGroup[] = [
  {
    items: [
      {
        label: "Audit & Records",
        href: "/hr-dashboard",
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
            <rect x="9" y="3" width="6" height="4" rx="1" />
            <path d="M9 12h6M9 16h6" />
          </svg>
        ),
      },
      {
        label: "Records",
        href: "/hr-records",
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
        ),
      },
      {
        label: "Payroll Periods",
        href: "/hr-payroll",
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="6" width="20" height="14" rx="2" />
            <path d="M2 10h20M6 16h4" />
          </svg>
        ),
      },
      {
        label: "Exports",
        href: "/hr-exports",
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        ),
      },
    ],
  },
];

export default function HRLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarShell variant="command-center" centerLabel="HR Admin Portal" groups={HR_GROUPS}>
      {children}
    </SidebarShell>
  );
}
