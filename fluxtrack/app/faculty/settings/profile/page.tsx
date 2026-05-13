"use client";

import { useEffect, useState } from "react";
import RoleTopBar from "@/components/layout/role-topbar";

type MeResponse = {
  user?: {
    id: string;
    email: string;
    full_name: string;
    role: string;
    faculty_id: string | null;
    department: string | null;
  };
  error?: { code: string; message: string };
};

type Device = {
  id: string;
  name: string;
  mac_hint: string | null;
  device_type: string | null;
  is_primary: boolean;
  is_active: boolean;
  last_seen_at: string | null;
  created_at: string;
};

export default function ProfilePage() {
  const [data, setData] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/users/me")
      .then((r) => r.json())
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, []);

  const user = data?.user;

  return (
    <div className="flex-1 flex flex-col">
      <RoleTopBar
        greetingName={user?.full_name ?? "Christopher Josh L. Dellosa"}
        department={user?.department ?? "College of Computer and Information Science"}
        notificationCount={3}
      />

      <div className="px-4 sm:px-6 lg:px-8 pb-6 lg:pb-8 space-y-4 lg:space-y-5 fade-up">
        {/* Profile information card */}
        <Section
          title="Profile Information"
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          }
        >
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 lg:gap-x-12 gap-y-4 lg:gap-y-5">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i}>
                  <div className="h-3 w-20 skeleton mb-2" />
                  <div className="h-4 w-44 skeleton" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 lg:gap-x-12 gap-y-4 lg:gap-y-5">
              <Field label="Full Name" value={user?.full_name ?? "—"} />
              <Field label="Faculty ID" value={user?.faculty_id ?? "FAC-2024-0847"} />
              <Field label="Department" value={user?.department ?? "—"} />
              <Field label="Employment Type" value="Full-time" />
              <Field label="Email" value={user?.email ?? "—"} />
              <Field label="Current Term" value="2nd Semester 2025–2026" />
            </div>
          )}
        </Section>

        <DevicesCard />
      </div>
    </div>
  );
}

function DevicesCard() {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Add-device form state
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("laptop");
  const [newMacHint, setNewMacHint] = useState("");
  const [newPrimary, setNewPrimary] = useState(false);

  const refresh = async () => {
    const res = await fetch("/api/users/me/devices");
    const json = await res.json();
    if (Array.isArray(json.devices)) setDevices(json.devices);
  };

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newName.trim().length < 1) {
      setError("Device name is required");
      return;
    }
    setBusyId("__new");
    try {
      const res = await fetch("/api/users/me/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          device_type: newType,
          mac_hint: newMacHint.trim() || null,
          is_primary: newPrimary,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error?.message ?? "Failed to add device");
      }
      setNewName("");
      setNewMacHint("");
      setNewType("laptop");
      setNewPrimary(false);
      setAdding(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add device");
    } finally {
      setBusyId(null);
    }
  };

  const handleRename = async (id: string) => {
    if (editName.trim().length < 1) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/users/me/devices/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim() }),
      });
      if (!res.ok) throw new Error("Rename failed");
      setEditingId(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rename failed");
    } finally {
      setBusyId(null);
    }
  };

  const handleSetPrimary = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/users/me/devices/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_primary: true }),
      });
      if (!res.ok) throw new Error("Failed to set primary");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set primary");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Remove "${name}"? You can re-add it later.`)) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/users/me/devices/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Section
      title="Registered Devices"
      icon={
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="5" y="2" width="14" height="20" rx="2" />
          <line x1="12" y1="18" x2="12.01" y2="18" />
        </svg>
      }
      action={
        !adding && (
          <button
            onClick={() => { setAdding(true); setError(null); }}
            className="text-[12px] font-bold text-[#114b9f] hover:text-[#001c43] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add device
          </button>
        )
      }
    >
      <div className="space-y-3">
        {error && (
          <div className="px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-[12px] text-rose-700">
            {error}
          </div>
        )}

        {adding && (
          <form
            onSubmit={handleAdd}
            className="p-4 rounded-xl bg-blue-50/40 border border-blue-100 space-y-3"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Name</span>
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Work Laptop"
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-[13px] focus:outline-none focus:border-[#114b9f]"
                  maxLength={64}
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Type</span>
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value)}
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-[13px] focus:outline-none focus:border-[#114b9f]"
                >
                  <option value="laptop">Laptop</option>
                  <option value="tablet">Tablet</option>
                  <option value="phone">Phone</option>
                  <option value="desktop">Desktop</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label className="block sm:col-span-2">
                <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">MAC hint (optional)</span>
                <input
                  value={newMacHint}
                  onChange={(e) => setNewMacHint(e.target.value)}
                  placeholder="last 2 octets, e.g. 6A:F2"
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-[13px] focus:outline-none focus:border-[#114b9f]"
                  maxLength={32}
                />
              </label>
            </div>
            <label className="flex items-center gap-2 text-[12.5px] text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={newPrimary}
                onChange={(e) => setNewPrimary(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300"
              />
              Make this my primary device for attendance
            </label>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="submit"
                disabled={busyId === "__new"}
                className="px-4 py-2 rounded-lg bg-[#001c43] text-white text-[12.5px] font-bold hover:bg-[#114b9f] transition-colors disabled:opacity-60"
              >
                {busyId === "__new" ? "Adding…" : "Add device"}
              </button>
              <button
                type="button"
                onClick={() => { setAdding(false); setError(null); }}
                className="px-4 py-2 rounded-lg bg-white border border-slate-200 text-[12.5px] font-bold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <>
            <div className="h-16 skeleton rounded-xl" />
            <div className="h-16 skeleton rounded-xl" />
          </>
        ) : devices && devices.length > 0 ? (
          devices.map((d) => (
            <DeviceRow
              key={d.id}
              device={d}
              busy={busyId === d.id}
              editing={editingId === d.id}
              editName={editName}
              setEditName={setEditName}
              onStartEdit={() => { setEditingId(d.id); setEditName(d.name); }}
              onCancelEdit={() => setEditingId(null)}
              onCommitEdit={() => handleRename(d.id)}
              onSetPrimary={() => handleSetPrimary(d.id)}
              onDelete={() => handleDelete(d.id, d.name)}
            />
          ))
        ) : (
          !adding && (
            <p className="text-[12.5px] text-slate-500 italic">
              No devices registered yet. Add your work laptop or tablet so attendance heartbeats can recognise you.
            </p>
          )
        )}
      </div>
    </Section>
  );
}

function Section({
  title,
  icon,
  children,
  action,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="card-surface p-6">
      <header className="flex items-center justify-between gap-2.5 text-[#001c43] mb-5">
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-xl bg-blue-50 text-[#114b9f] flex items-center justify-center">
            {icon}
          </span>
          <h2 className="text-title">{title}</h2>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-slate-400 mb-0.5">{label}</p>
      <p className="text-[13.5px] font-bold text-[#001c43] break-words">{value}</p>
    </div>
  );
}

function DeviceRow({
  device,
  busy,
  editing,
  editName,
  setEditName,
  onStartEdit,
  onCancelEdit,
  onCommitEdit,
  onSetPrimary,
  onDelete,
}: {
  device: Device;
  busy: boolean;
  editing: boolean;
  editName: string;
  setEditName: (v: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onCommitEdit: () => void;
  onSetPrimary: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-50 border border-slate-100">
      <span className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
        <DeviceIcon type={device.device_type} />
      </span>
      <div className="flex-1 min-w-0">
        {editing ? (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onCommitEdit();
                if (e.key === "Escape") onCancelEdit();
              }}
              maxLength={64}
              className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-[13px] focus:outline-none focus:border-[#114b9f]"
            />
            <button
              onClick={onCommitEdit}
              disabled={busy}
              className="px-3 py-1.5 rounded-lg bg-[#001c43] text-white text-[11.5px] font-bold hover:bg-[#114b9f] disabled:opacity-60"
            >
              Save
            </button>
            <button
              onClick={onCancelEdit}
              className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-[11.5px] font-bold text-slate-700"
            >
              Cancel
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-[13px] font-bold text-[#001c43] truncate">{device.name}</p>
              {device.is_primary && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold uppercase tracking-wider">
                  Primary
                </span>
              )}
              {device.device_type && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 font-medium uppercase tracking-wider">
                  {device.device_type}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500">
              {device.mac_hint ? `MAC: XX:XX:XX:XX:${device.mac_hint}` : "MAC hint not set"}
            </p>
            <p className="text-[11px] text-slate-400">
              {device.last_seen_at ? `Last seen: ${formatRelativeTime(device.last_seen_at)}` : "Never connected"}
            </p>
          </>
        )}
      </div>
      {!editing && (
        <div className="flex items-center gap-1 shrink-0">
          {!device.is_primary && (
            <button
              onClick={onSetPrimary}
              disabled={busy}
              title="Make primary"
              className="text-slate-400 hover:text-emerald-600 transition-colors p-2 rounded-lg hover:bg-emerald-50 disabled:opacity-50"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="12 2 15 8.5 22 9.3 17 14.1 18.2 21 12 17.8 5.8 21 7 14.1 2 9.3 9 8.5 12 2" />
              </svg>
            </button>
          )}
          <button
            onClick={onStartEdit}
            disabled={busy}
            title="Rename"
            className="text-slate-400 hover:text-[#114b9f] transition-colors p-2 rounded-lg hover:bg-blue-50 disabled:opacity-50"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
          </button>
          <button
            onClick={onDelete}
            disabled={busy}
            title="Remove"
            className="text-slate-300 hover:text-rose-500 transition-colors p-2 rounded-lg hover:bg-rose-50 disabled:opacity-50"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
              <path d="M10 11v6M14 11v6" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

function DeviceIcon({ type }: { type: string | null }) {
  switch (type) {
    case "tablet":
    case "phone":
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="5" y="2" width="14" height="20" rx="2" />
          <line x1="12" y1="18" x2="12.01" y2="18" />
        </svg>
      );
    case "desktop":
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
      );
    default:
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="4" width="20" height="12" rx="2" />
          <line x1="2" y1="20" x2="22" y2="20" />
        </svg>
      );
  }
}

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const min = Math.floor(diff / 60000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}
