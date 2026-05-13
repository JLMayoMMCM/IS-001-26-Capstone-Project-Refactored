"use client";

import { useCallback, useEffect, useState } from "react";
import EmptyState from "@/components/ui/empty-state";

type AuditEvent = {
  id: string;
  event_type: string;
  actor_id: string | null;
  target_type: string | null;
  target_id: string | null;
  payload: unknown;
  ip_address: string | null;
  created_at: string;
  actor?: { full_name: string; email: string; role: string } | null;
};

export default function AdminAuditPage() {
  const [items, setItems] = useState<AuditEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const limit = 50;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({ event: "", target_type: "", from: "", to: "" });

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      if (filters.event) params.set("event", filters.event);
      if (filters.target_type) params.set("target_type", filters.target_type);
      if (filters.from) params.set("from", filters.from);
      if (filters.to) params.set("to", filters.to);
      const res = await fetch(`/apis/admin/audit?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as { events: AuditEvent[]; total: number };
      setItems(j.events);
      setTotal(j.total);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [filters, offset]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Audit Log</h1>
        <p className="text-sm text-slate-500">Every state-changing event tracked in the system.</p>
      </header>

      <div className="bg-white rounded-xl border border-slate-200 p-4 grid grid-cols-1 sm:grid-cols-5 gap-3">
        <input
          className="text-sm border border-slate-200 rounded-md px-2 py-2"
          placeholder="event_type (e.g. session.update)"
          value={filters.event}
          onChange={(e) => setFilters({ ...filters, event: e.target.value })}
        />
        <input
          className="text-sm border border-slate-200 rounded-md px-2 py-2"
          placeholder="target_type (e.g. schedule)"
          value={filters.target_type}
          onChange={(e) => setFilters({ ...filters, target_type: e.target.value })}
        />
        <input
          className="text-sm border border-slate-200 rounded-md px-2 py-2"
          type="datetime-local"
          value={filters.from}
          onChange={(e) => setFilters({ ...filters, from: e.target.value })}
        />
        <input
          className="text-sm border border-slate-200 rounded-md px-2 py-2"
          type="datetime-local"
          value={filters.to}
          onChange={(e) => setFilters({ ...filters, to: e.target.value })}
        />
        <button
          onClick={() => {
            setOffset(0);
            refresh();
          }}
          className="px-3 py-2 rounded-md bg-slate-900 text-white text-sm font-medium hover:bg-slate-800"
        >
          Apply filters
        </button>
      </div>

      {error && <div className="text-xs text-rose-600">{error}</div>}
      {loading ? (
        <div className="text-sm text-slate-500">Loading…</div>
      ) : items.length === 0 ? (
        <EmptyState title="No events match these filters" />
      ) : (
        <>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-2">When</th>
                  <th className="text-left px-4 py-2">Event</th>
                  <th className="text-left px-4 py-2">Actor</th>
                  <th className="text-left px-4 py-2">Target</th>
                  <th className="text-left px-4 py-2">IP</th>
                </tr>
              </thead>
              <tbody>
                {items.map((e) => (
                  <tr key={e.id} className="border-t border-slate-100 align-top">
                    <td className="px-4 py-2 text-slate-500 whitespace-nowrap">
                      {new Date(e.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-slate-900">{e.event_type}</td>
                    <td className="px-4 py-2 text-slate-700">
                      {e.actor ? (
                        <div>
                          <div className="text-xs font-medium">{e.actor.full_name}</div>
                          <div className="text-[10px] text-slate-500">
                            {e.actor.role} · {e.actor.email}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-slate-700 text-xs">
                      {e.target_type ?? "—"}
                      {e.target_id ? <span className="text-slate-400">/{e.target_id.slice(0, 8)}</span> : null}
                    </td>
                    <td className="px-4 py-2 text-slate-500 text-xs">{e.ip_address ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>
              {offset + 1}–{Math.min(offset + items.length, total)} of {total}
            </span>
            <div className="flex gap-2">
              <button
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - limit))}
                className="px-2 py-1 rounded-md border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
              >
                Prev
              </button>
              <button
                disabled={offset + items.length >= total}
                onClick={() => setOffset(offset + limit)}
                className="px-2 py-1 rounded-md border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
