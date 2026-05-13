"use client";

import { useMemo, useState } from "react";
import { useAssistFeed, type AssistRequest } from "@/hooks/use-assist-feed";
import EmptyState from "@/components/ui/empty-state";

type FilterTab = "open" | "acknowledged" | "escalated" | "all";

function ago(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export default function IFOAssistsPage() {
  const { items, loading, error, refresh } = useAssistFeed("all");
  const [tab, setTab] = useState<FilterTab>("open");
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return items.filter((a) => {
      if (tab === "all") return true;
      if (tab === "open") return !a.ifo_acknowledged_at && !a.escalated_at;
      if (tab === "acknowledged") return !!a.ifo_acknowledged_at && !a.escalated_at;
      if (tab === "escalated") return !!a.escalated_at;
      return true;
    });
  }, [items, tab]);

  async function acknowledge(a: AssistRequest) {
    setBusy(a.id);
    try {
      const res = await fetch(`/apis/assists/${a.id}/acknowledge`, { method: "POST" });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(j?.error?.message ?? `HTTP ${res.status}`);
      }
      setToast("Acknowledged.");
      setTimeout(() => setToast(null), 2000);
      await refresh();
    } catch (e) {
      setToast(e instanceof Error ? e.message : String(e));
      setTimeout(() => setToast(null), 4000);
    } finally {
      setBusy(null);
    }
  }

  const openCount = items.filter((a) => !a.ifo_acknowledged_at && !a.escalated_at).length;
  const ackCount = items.filter((a) => a.ifo_acknowledged_at && !a.escalated_at).length;
  const escCount = items.filter((a) => a.escalated_at).length;

  return (
    <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Assist Requests</h1>
        <p className="text-sm text-slate-500">
          Live faculty assist feed. Acknowledge within 10 minutes to prevent escalation.
        </p>
      </header>

      <div className="flex items-center gap-2 flex-wrap">
        <Tab active={tab === "open"}         onClick={() => setTab("open")}>Open ({openCount})</Tab>
        <Tab active={tab === "acknowledged"} onClick={() => setTab("acknowledged")}>Acknowledged ({ackCount})</Tab>
        <Tab active={tab === "escalated"}    onClick={() => setTab("escalated")}>Escalated ({escCount})</Tab>
        <Tab active={tab === "all"}          onClick={() => setTab("all")}>All ({items.length})</Tab>
      </div>

      {toast && <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2 inline-block">{toast}</div>}
      {error && <div className="text-xs text-rose-600">{error}</div>}

      {loading ? (
        <div className="text-sm text-slate-500">Loading…</div>
      ) : filtered.length === 0 ? (
        <EmptyState title="No assist requests match this filter" description="They'll appear here as faculty file them." />
      ) : (
        <ul className="space-y-2">
          {filtered.map((a) => {
            const elapsed = Math.floor((Date.now() - new Date(a.sent_at).getTime()) / 60_000);
            const isStale = !a.ifo_acknowledged_at && elapsed >= 10;
            return (
              <li
                key={a.id}
                className={`bg-white border rounded-xl p-4 ${
                  a.escalated_at ? "border-rose-300" : isStale ? "border-amber-300" : "border-slate-200"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-slate-900">
                        {a.faculty?.full_name ?? "Faculty"} ·{" "}
                        <span className="font-mono">{a.room?.room_code ?? "—"}</span>
                      </span>
                      {a.escalated_at ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">Escalated</span>
                      ) : a.ifo_acknowledged_at ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Acknowledged</span>
                      ) : isStale ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Past SLA</span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">Open</span>
                      )}
                      <span className="text-[10px] text-slate-400">{ago(a.sent_at)} ago</span>
                    </div>
                    <div className="text-sm text-slate-700 mt-1">{a.note ?? <span className="italic text-slate-400">No note</span>}</div>
                    <div className="text-[10px] text-slate-500 mt-1 font-mono">
                      Type: {a.assist_types}
                      {a.room && <> · {a.room.building} F{a.room.floor_number}</>}
                    </div>
                    {a.guard_acknowledged_at && (
                      <div className="text-[10px] text-slate-500 mt-1">
                        Guard ack {ago(a.guard_acknowledged_at)} ago · Resolution: {a.guard_resolution_status ?? "pending"}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    {!a.ifo_acknowledged_at && !a.escalated_at && (
                      <button
                        onClick={() => acknowledge(a)}
                        disabled={busy === a.id}
                        className="px-3 py-1.5 rounded-md bg-slate-900 text-white text-xs font-medium disabled:opacity-50"
                      >
                        {busy === a.id ? "Acknowledging…" : "Acknowledge"}
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 text-xs rounded-md ${
        active ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}
