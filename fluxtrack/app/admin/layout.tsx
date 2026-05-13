import DemoBanner from "@/components/demo/demo-banner";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <DemoBanner />
      {children}
    </div>
  );
}
