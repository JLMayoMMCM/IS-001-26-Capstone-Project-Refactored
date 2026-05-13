"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function CheckerDashboard() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/checker-checklist");
  }, [router]);
  return (
    <div className="flex items-center justify-center h-screen bg-slate-50">
      <p className="text-slate-500">Loading...</p>
    </div>
  );
}
