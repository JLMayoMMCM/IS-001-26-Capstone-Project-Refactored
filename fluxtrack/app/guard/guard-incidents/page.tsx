"use client";

import { useMemo, useState } from "react";
import { useAssistFeed, type AssistRequest } from "@/hooks/use-assist-feed";
import EmptyState from "@/components/ui/empty-state";

const RESOLUTION_LABEL: Record<NonNullable<AssistRequest["guard_resolution_status"]>, string> = {
  resolved_onsite: "Resolved on-site",
  referred_ifo: "Referred to IFO",
  referred_external: "Referred external",
  no_issue: "No issue found",
  other: "Other",
};

export default function GuardIncidentsPage() {
  const { items, loading, error } = useAssistFeed("floor");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [resolution, setResolution] = useState<string>("all");

  const filtered = useMemo(() => {
    return items
      .filter((a) => !!a.guard_acknowledged_at)
      .filter((a) => {
        if (from && a.guard_acknowledged_at && a.guard_acknowledged_at.slice(0, 10) < from) return false;
        if (to && a.guard_acknowledged_at && a.guard_acknowledged_at.slice(0, 10) > to) return false;
        if (resolution !== "all" && a.guard_resolution_status !== resolution) return false;
        return true;
      })
      .sort((a, b) => (a.guard_acknowledged_at! < b.guard_acknowledged_at! ? 1 : -1));
  }, [items, from, to, resolution]);

  const totals = useMemo(() => {
    const map: Record<string, number> = {};
    for (const a of filtered) {
      const r = a.guard_resolution_status ?? "pending";
      map[r] = (map[r] ?? 0) + 1;
    }
    return map;
  }, [filtered]);

  return (
    <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Incident History</h1>
        <p className="text-sm text-slate-500">
          Your guard-acknowledged assist requests and their resolutions.
        </p>
      </header>

      <section className="bg-white rounded-xl border border-slate-200 p-4 grid grid-cols-1 sm:grid-cols-4 gap-3">
        <label className="text-xs">
          From
          <input
            type="date"
            className="block mt-1 text-sm border border-slate-200 rounded-md px-2 py-1.5 w-full"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="text-xs">
          To
          <input
            type="date"
            className="block mt-1 text-sm border border-slate-200 rounded-md px-2 py-1.5 w-full"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <label className="text-xs">
          Resolution
          <select
            className="block mt-1 text-sm border border-slate-200 rounded-md px-2 py-1.5 w-full bg-white"
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
          >
            <option value="all">All</option>
            {Object.entries(RESOLUTION_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end text-xs text-slate-500">
          <span>
            {filtered.length} incident{filtered.length === 1 ? "" : "s"} match
          </span>
        </div>
      </section>

      {Object.keys(totals).length > 0 && (
        <section className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {Object.entries(totals).map(([k, v]) => (
            <div key={k} className="bg-white border border-slate-200 rounded-md px-3 py-2">
              <div className="text-lg font-semibold text-slate-900">{v}</div>
              <div className="text-[10px] uppercase tracking-wide text-slate-500">
                {RESOLUTION_LABEL[k as keyof typeof RESOLUTION_LABEL] ?? k}
              </div>
            </div>
          ))}
        </section>
      )}

      {error && <div className="text-xs text-rose-600">{error}</div>}

      {loading ? (
        <div className="text-sm text-slate-500">Loading…</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No incidents in this range"
          description="Acknowledged assist requests appear here once you log a resolution."
        />
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2">When</th>
                <th className="text-left px-4 py-2">Room</th>
                <th className="text-left px-4 py-2">Type</th>
                <th className="text-left px-4 py-2">Resolution</th>
                <th className="text-left px-4 py-2">Note</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id} className="border-t border-slate-100 align-top">
                  <td className="px-4 py-2 text-slate-500 whitespace-nowrap text-xs">
                    {a.guard_acknowledged_at ? new Date(a.guard_acknowledged_at).toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-2 font-mono text-slate-700">{a.room?.room_code ?? "—"}</td>
                  <td className="px-4 py-2 text-slate-700 text-xs">{a.assist_types}</td>
                  <td className="px-4 py-2">
                    {a.guard_resolution_status ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                        {RESOLUTION_LABEL[a.guard_resolution_status]}
                      </span>
                    ) : (
                      <span className="text-xs text-amber-700">Pending</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-700">
                    {a.guard_incident_note ?? <span className="italic text-slate-400">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
