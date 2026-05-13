"use client";

import { useEffect, useState } from "react";

type Role = "faculty" | "ifo_admin" | "checker" | "guard" | "hr_admin" | "system_admin";
type EmploymentType = "full_time" | "part_time";

type User = {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  faculty_id: string | null;
  department: string | null;
  employment_type: EmploymentType | null;
  is_active: boolean;
  last_login: string | null;
  created_at: string;
};

const ROLE_BADGE: Record<Role, string> = {
  faculty:      "bg-blue-100 text-blue-700",
  ifo_admin:    "bg-purple-100 text-purple-700",
  checker:      "bg-cyan-100 text-cyan-700",
  guard:        "bg-amber-100 text-amber-700",
  hr_admin:     "bg-green-100 text-green-700",
  system_admin: "bg-slate-900 text-white",
};

const ROLES: Role[] = ["faculty", "ifo_admin", "checker", "guard", "hr_admin", "system_admin"];

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Role | "all">("all");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    email: "", full_name: "", role: "faculty" as Role,
    department: "", faculty_id: "", employment_type: "" as "" | EmploymentType,
  });
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    const url = filter === "all" ? "/api/users" : `/api/users?role=${filter}`;
    const res = await fetch(url, { cache: "no-store" });
    const data = await res.json();
    setUsers(data?.users ?? []);
    setLoading(false);
  }

  useEffect(() => { refresh(); }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: form.email,
        full_name: form.full_name,
        role: form.role,
        department: form.department || undefined,
        faculty_id: form.faculty_id || undefined,
        employment_type: form.employment_type || undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setErr(data?.error?.message ?? "Failed to create user");
      return;
    }
    setCreating(false);
    setForm({ email: "", full_name: "", role: "faculty", department: "", faculty_id: "", employment_type: "" });
    refresh();
  }

  async function toggleActive(u: User) {
    const res = await fetch(`/api/users/${u.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !u.is_active }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      alert(d?.error?.message ?? "Update failed");
      return;
    }
    refresh();
  }

  async function changeRole(u: User, role: Role) {
    if (role === u.role) return;
    if (!confirm(`Change ${u.full_name} from ${u.role} to ${role}?`)) return;
    const res = await fetch(`/api/users/${u.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      alert(d?.error?.message ?? "Update failed");
      return;
    }
    refresh();
  }

  return (
    <div className="min-h-full p-8">
      <header className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">User Provisioning</h1>
          <p className="text-sm text-slate-500 mt-0.5">{users.length} users · System Admin only</p>
        </div>
        <button
          onClick={() => setCreating((c) => !c)}
          className="px-4 py-2.5 rounded-xl text-sm font-bold text-white shadow-sm bg-slate-900 hover:bg-slate-800"
        >
          {creating ? "Cancel" : "+ Provision User"}
        </button>
      </header>

      {creating && (
        <form onSubmit={createUser} className="bg-white border border-slate-200 rounded-lg p-5 mb-5 shadow-sm">
          <h2 className="text-sm font-bold text-slate-900 mb-3">New User</h2>
          {err && <p className="mb-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
          <div className="grid grid-cols-12 gap-3">
            <Field label="Email" cols={6}>
              <input
                type="email" required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className={inputCls}
                placeholder="firstname.lastname@mmcm.edu.ph"
              />
            </Field>
            <Field label="Full Name" cols={6}>
              <input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Role" cols={4}>
              <select required value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })} className={inputCls}>
                {ROLES.map((r) => <option key={r} value={r}>{r.replace("_", " ")}</option>)}
              </select>
            </Field>
            <Field label="Department" cols={4}>
              <input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Faculty ID (optional)" cols={4}>
              <input value={form.faculty_id} onChange={(e) => setForm({ ...form, faculty_id: e.target.value })} className={inputCls} placeholder="FAC-2026-0001" />
            </Field>
            {form.role === "faculty" && (
              <Field label="Employment Type" cols={4}>
                <select value={form.employment_type} onChange={(e) => setForm({ ...form, employment_type: e.target.value as "full_time" | "part_time" | "" })} className={inputCls}>
                  <option value="">—</option>
                  <option value="full_time">Full-time</option>
                  <option value="part_time">Part-time</option>
                </select>
              </Field>
            )}
          </div>
          <div className="flex justify-end mt-3">
            <button type="submit" className="px-5 py-2 rounded-lg text-sm font-bold text-white bg-slate-900">
              Provision Account
            </button>
          </div>
        </form>
      )}

      <div className="flex gap-2 mb-4 flex-wrap">
        {(["all", ...ROLES] as Array<Role | "all">).map((r) => (
          <button
            key={r}
            onClick={() => setFilter(r)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
              filter === r ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200"
            }`}
          >
            {r === "all" ? "All" : r.replace("_", " ")}
          </button>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            <div className="h-12 skeleton" />
            <div className="h-12 skeleton" />
          </div>
        ) : users.length === 0 ? (
          <p className="p-10 text-center text-sm text-slate-400">No users.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {["Name", "Email", "Role", "Dept", "Status", "Last Login", ""].map((h) => (
                  <th key={h} className="px-3 py-2.5 text-left font-bold text-xs text-slate-600 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2 font-medium text-slate-900">{u.full_name}</td>
                  <td className="px-3 py-2 text-slate-500">{u.email}</td>
                  <td className="px-3 py-2">
                    <select
                      value={u.role}
                      onChange={(e) => changeRole(u, e.target.value as Role)}
                      className={`text-xs px-2 py-1 rounded-full font-bold border-0 ${ROLE_BADGE[u.role]}`}
                    >
                      {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-slate-500 text-xs">{u.department ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                      u.is_active ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"
                    }`}>
                      {u.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-400">
                    {u.last_login ? new Date(u.last_login).toLocaleDateString() : "Never"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => toggleActive(u)}
                      className="text-xs font-semibold text-slate-600 hover:text-slate-900"
                    >
                      {u.is_active ? "Deactivate" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const inputCls = "w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

function Field({ label, cols, children }: { label: string; cols: number; children: React.ReactNode }) {
  return (
    <label className={`col-span-${cols} block`} style={{ gridColumn: `span ${cols} / span ${cols}` }}>
      <span className="block text-xs font-semibold text-slate-600 mb-1">{label}</span>
      {children}
    </label>
  );
}
