import SidebarShell from "@/components/layout/sidebar-shell";
import type { SidebarGroup } from "@/components/layout/brand-sidebar";

// Settings (Profile / Preferences / Sign Out) lives in the topbar's gear menu
// for every role — see <SettingsMenu>. Keeping the sidebar focused on
// navigation reduces surface duplication.
const FACULTY_GROUPS: SidebarGroup[] = [
  {
    title: "Main Menu",
    items: [
      {
        label: "Dashboard",
        href: "/dashboard",
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
        ),
      },
      {
        label: "Attendance History",
        href: "/attendance",
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        ),
      },
      {
        label: "Schedule",
        href: "/schedule",
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        ),
      },
    ],
  },
];

export default function FacultyLayout({ children }: { children: React.ReactNode }) {
  return <SidebarShell variant="wordmark" groups={FACULTY_GROUPS}>{children}</SidebarShell>;
}
