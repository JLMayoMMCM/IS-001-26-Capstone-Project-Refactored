"use client";

import { useState } from "react";
import { useAssistFeed, type AssistRequest } from "@/hooks/use-assist-feed";

export default function CheckerAssistsPage() {
  const { items, loading, refresh } = useAssistFeed();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function acknowledge(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/assists/${id}/acknowledge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "checker" }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error?.message ?? d?.error ?? `HTTP ${res.status}`);
      }
      await refresh();
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusyId(null);
    }
  }

  // Checker acts on the IFO/checker side; treat ifo_acknowledged_at as the
  // marker of "already handled" for filtering.
  const unack = items.filter((i) => !i.ifo_acknowledged_at && !i.guard_acknowledged_at);
  const ackd = items.filter((i) => i.ifo_acknowledged_at || i.guard_acknowledged_at);

  return (
    <div className="min-h-full p-4 pb-20 space-y-3">
      <header className="px-1 mb-2">
        <h1 className="text-lg font-bold text-[#001c43]">Assist Feed</h1>
        <p className="text-xs text-slate-500">
          {unack.length} unacknowledged · live updates
        </p>
      </header>

      {error && (
        <div className="px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-[12px] text-rose-700 font-bold">
          {error}
        </div>
      )}

      {loading && items.length === 0 ? (
        <div className="space-y-3">
          <div className="h-20 skeleton rounded-xl" />
          <div className="h-20 skeleton rounded-xl" />
        </div>
      ) : items.length === 0 ? (
        <p className="py-12 text-center text-sm text-slate-400">No assist requests yet.</p>
      ) : (
        <>
          {unack.length > 0 && (
            <div>
              <p className="text-xs font-bold text-rose-600 uppercase tracking-wider mb-2">Unacknowledged</p>
              <div className="space-y-2">
                {unack.map((a) => (
                  <AssistCard key={a.id} a={a} onAck={() => acknowledge(a.id)} unread busy={busyId === a.id} />
                ))}
              </div>
            </div>
          )}
          {ackd.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Recently Acknowledged</p>
              <div className="space-y-2">
                {ackd.map((a) => <AssistCard key={a.id} a={a} />)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function AssistCard({ a, unread, busy, onAck }: { a: AssistRequest; unread?: boolean; busy?: boolean; onAck?: () => void }) {
  return (
    <div className={`bg-white border rounded-xl p-4 ${unread ? "border-l-4 border-l-rose-400 border-y border-r border-slate-200" : "border-slate-200"}`}>
      <div className="flex items-start justify-between gap-2 mb-1">
        <div>
          <p className="text-sm font-bold text-[#001c43]">
            Room {a.room?.room_code ?? "?"} · Floor {a.room?.floor_number ?? "?"}
          </p>
          <p className="text-xs text-slate-500">{a.faculty?.full_name ?? "Unknown faculty"}</p>
        </div>
        <span className="text-xs text-slate-400 shrink-0">
          {new Date(a.sent_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
      <div className="flex gap-1 flex-wrap mb-2">
        {a.assist_types.split(",").map((t) => (
          <span key={t} className="text-[10.5px] px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-bold">
            {t.trim()}
          </span>
        ))}
      </div>
      {a.note && <p className="text-xs text-slate-700 mb-2">{a.note}</p>}
      {unread && onAck && (
        <button
          onClick={onAck}
          disabled={busy}
          className="w-full mt-2 py-2 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? "Acknowledging…" : "Acknowledge"}
        </button>
      )}
      {!unread && (
        <p className="text-xs text-emerald-600 font-bold">✓ Acknowledged</p>
      )}
    </div>
  );
}
