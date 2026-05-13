"use client";

import { useCallback, useEffect, useState } from "react";
import EmptyState from "@/components/ui/empty-state";

type ValueType = "integer" | "boolean" | "string" | "minutes" | "hours" | "enum";

type Setting = {
  key: string;
  value: { v: unknown } | unknown;
  value_type: ValueType;
  description: string | null;
  updated_at: string;
};

function readValue(s: Setting): unknown {
  const v = s.value as { v?: unknown };
  return v && typeof v === "object" && "v" in v ? v.v : s.value;
}

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/apis/admin/settings", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as { settings: Setting[] };
      setSettings(j.settings);
      const d: Record<string, string> = {};
      for (const s of j.settings) d[s.key] = String(readValue(s) ?? "");
      setDrafts(d);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function parse(value: string, type: ValueType): unknown {
    if (type === "integer" || type === "minutes" || type === "hours") {
      const n = Number(value);
      if (!Number.isInteger(n)) throw new Error("must be an integer");
      return n;
    }
    if (type === "boolean") {
      if (value === "true" || value === "1") return true;
      if (value === "false" || value === "0") return false;
      throw new Error("must be true/false");
    }
    return value;
  }

  async function save(s: Setting) {
    setBusy(true);
    setError(null);
    try {
      const parsed = parse(drafts[s.key] ?? "", s.value_type);
      const res = await fetch("/apis/admin/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ updates: [{ key: s.key, value: parsed, value_type: s.value_type }] }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(j?.error?.message ?? `HTTP ${res.status}`);
      }
      setToast(`Saved ${s.key}`);
      setTimeout(() => setToast(null), 2500);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">System Settings</h1>
        <p className="text-sm text-slate-500">
          Tunables backing the BR defaults. Changes take effect on the next request.
        </p>
      </header>

      {toast && (
        <div className="text-xs px-3 py-2 rounded-md bg-emerald-100 text-emerald-700 inline-block">{toast}</div>
      )}
      {error && <div className="text-xs text-rose-600">{error}</div>}

      {loading ? (
        <div className="text-sm text-slate-500">Loading…</div>
      ) : settings.length === 0 ? (
        <EmptyState
          title="No settings rows"
          description="Apply the 09_business_rules_migration.sql to seed defaults."
        />
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2">Key</th>
                <th className="text-left px-4 py-2">Type</th>
                <th className="text-left px-4 py-2">Value</th>
                <th className="text-left px-4 py-2">Description</th>
                <th className="text-right px-4 py-2">&nbsp;</th>
              </tr>
            </thead>
            <tbody>
              {settings.map((s) => (
                <tr key={s.key} className="border-t border-slate-100 align-top">
                  <td className="px-4 py-2 font-mono text-xs text-slate-900">{s.key}</td>
                  <td className="px-4 py-2 text-slate-500 text-xs">{s.value_type}</td>
                  <td className="px-4 py-2">
                    {s.value_type === "boolean" ? (
                      <select
                        className="text-sm border border-slate-200 rounded-md px-2 py-1"
                        value={drafts[s.key] ?? ""}
                        onChange={(e) => setDrafts({ ...drafts, [s.key]: e.target.value })}
                      >
                        <option value="true">true</option>
                        <option value="false">false</option>
                      </select>
                    ) : (
                      <input
                        className="text-sm border border-slate-200 rounded-md px-2 py-1 w-32"
                        value={drafts[s.key] ?? ""}
                        onChange={(e) => setDrafts({ ...drafts, [s.key]: e.target.value })}
                      />
                    )}
                  </td>
                  <td className="px-4 py-2 text-slate-500 text-xs max-w-xs">{s.description ?? "—"}</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => save(s)}
                      disabled={busy || drafts[s.key] === String(readValue(s) ?? "")}
                      className="text-xs px-2 py-1 rounded-md bg-slate-900 text-white disabled:opacity-40"
                    >
                      Save
                    </button>
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
