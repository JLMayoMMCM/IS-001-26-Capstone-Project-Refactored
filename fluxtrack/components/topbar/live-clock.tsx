"use client";

import { useEffect, useState } from "react";

// Live clock in Asia/Manila time. Ticks once per second.
// Uses Intl.DateTimeFormat so the format is locale-aware and won't be off
// even if the user's machine is in a different TZ.
export default function LiveClock({ compact = false }: { compact?: boolean }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!now) {
    return <span className="text-xs text-slate-400 font-mono tabular-nums">—</span>;
  }

  const time = new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    hour: "2-digit",
    minute: "2-digit",
    second: compact ? undefined : "2-digit",
    hour12: false,
  }).format(now);

  const date = new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    weekday: "short",
    month: "short",
    day: "2-digit",
  }).format(now);

  return (
    <div className="hidden md:flex flex-col items-end leading-tight" aria-live="polite">
      <span className="text-xs font-mono tabular-nums text-slate-900">{time}</span>
      <span className="text-[10px] text-slate-500">{date} · Manila</span>
    </div>
  );
}
