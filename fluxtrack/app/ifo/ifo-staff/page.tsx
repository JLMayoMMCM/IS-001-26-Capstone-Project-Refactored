"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import EmptyState from "@/components/ui/empty-state";

type Shift = {
  id: string;
  user_id: string;
  role: "checker" | "guard";
  shift_date: string;
  scheduled_start: string;
  scheduled_end: string;
  actual_start: string | null;
  actual_end: string | null;
  rooms_validated: number;
  rooms_skipped: number;
  user: { full_name: string; email: string } | null;
  floors: Array<{ floor_number: number; building: string | null }>;
};

type StaffUser = {
  id: string;
  full_name: string;
  email: string;
  role: "checker" | "guard";
  is_active: boolean;
};

const FLOOR_OPTIONS = [1, 2, 3];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

export default function StaffPage() {
  const [date, setDate] = useState(todayStr());
  const [tab, setTab] = useState<"checker" | "guard">("checker");
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  // Assign modal
  const [assignOpen, setAssignOpen] = useState(false);
  const [staffOptions, setStaffOptions] = useState<StaffUser[]>([]);
  const [selUserId, setSelUserId] = useState("");
  const [selStart, setSelStart] = useState("07:30");
  const [selEnd, setSelEnd] = useState("17:00");
  const [selFloors, setSelFloors] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/apis/checker/shifts?date=${date}&role=${tab}`, { cache: "no-store" });
      const data = await res.json();
      setShifts(data?.shifts ?? []);
    } finally {
      setLoading(false);
    }
  }, [date, tab]);

  useEffect(() => { refresh(); }, [refresh]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  }

  async function copyYesterday() {
    setBusy(true);
    try {
      const res = await fetch("/apis/checker/shifts/copy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ from_date: yesterdayStr(), to_date: date, role: tab }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message ?? data?.error ?? `HTTP ${res.status}`);
      await refresh();
      showToast(`Copied ${data.copied} shift${data.copied === 1 ? "" : "s"} from yesterday (${data.skipped} skipped — already assigned).`);
    } catch (e) {
      showToast(`Copy failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function openAssign() {
    setError(null);
    setSelUserId("");
    setSelStart("07:30");
    setSelEnd("17:00");
    setSelFloors([]);
    setAssignOpen(true);
    // Lazy-load eligible users
    if (staffOptions.length === 0) {
      const [cRes, gRes] = await Promise.all([
        fetch("/apis/users?role=checker&active=true", { cache: "no-store" }),
        fetch("/apis/users?role=guard&active=true", { cache: "no-store" }),
      ]);
      const cData = await cRes.json().catch(() => ({}));
      const gData = await gRes.json().catch(() => ({}));
      const all: StaffUser[] = [...(cData?.users ?? []), ...(gData?.users ?? [])];
      setStaffOptions(all);
    }
  }

  const filteredOptions = useMemo(
    () => staffOptions.filter((u) => u.role === tab),
    [staffOptions, tab],
  );

  async function submitAssign() {
    if (!selUserId) { setError("Pick a staff member."); return; }
    if (selFloors.length === 0) { setError("Select at least one floor."); return; }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/apis/checker/shifts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          user_id: selUserId,
          role: tab,
          shift_date: date,
          scheduled_start: selStart,
          scheduled_end: selEnd,
          floors: selFloors.map((f) => ({ floor_number: f, building: "Main" })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message ?? data?.error ?? `HTTP ${res.status}`);
      setAssignOpen(false);
      await refresh();
      showToast("Shift assigned.");
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col fade-up">
            <div className="px-4 sm:px-6 lg:px-8 pb-6 lg:pb-8 space-y-4">
        <div className="card-surface p-5 lg:p-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="w-11 h-11 rounded-lg bg-blue-50 text-[#114b9f] flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </span>
            <div>
              <h1 className="text-headline text-[#001c43]">Floor Assignments</h1>
              <p className="text-[12.5px] text-slate-500 mt-0.5">Checker &amp; Guard shifts per floor</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 text-[13px] focus:outline-none focus:border-[#114b9f]"
            />
            <button
              onClick={copyYesterday}
              disabled={busy}
              className="px-4 py-2 rounded-xl text-[13px] font-bold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300 disabled:opacity-50"
            >
              Copy yesterday&apos;s
            </button>
            <button
              onClick={openAssign}
              className="px-4 py-2 rounded-xl text-[13px] font-bold text-white shadow-sm"
              style={{ background: "linear-gradient(135deg,#7c3aed,#5b21b6)" }}
            >
              + Assign
            </button>
          </div>
        </div>

        <div className="flex gap-2">
          {(["checker", "guard"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-xl text-[13px] font-bold transition-colors ${
                tab === t ? "bg-[#001c43] text-white" : "bg-white text-slate-600 border border-slate-200 hover:border-slate-300"
              }`}
            >
              {t === "checker" ? "Checkers" : "Guards"}
            </button>
          ))}
        </div>

        <div className="card-surface overflow-hidden">
          {loading ? (
            <div className="p-6 space-y-3">
              <div className="h-14 skeleton" />
              <div className="h-14 skeleton" />
            </div>
          ) : shifts.length === 0 ? (
            <EmptyState
              title="No assignments for this date"
              body={`No ${tab === "checker" ? "checker" : "guard"} shifts on ${date}. Use "+ Assign" or "Copy yesterday's" to add some.`}
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {shifts.map((s) => (
                <li key={s.id} className="px-5 py-4 flex items-center gap-4 min-h-[88px]">
                  <div className="w-11 h-11 rounded-lg bg-blue-100 text-blue-700 font-bold text-[11px] flex items-center justify-center shrink-0">
                    {(s.user?.full_name ?? "?").split(" ").map((p) => p[0]).slice(0, 2).join("")}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13.5px] font-bold text-[#001c43] truncate">{s.user?.full_name ?? "Unknown user"}</p>
                    <p className="text-[11px] text-slate-500 truncate">{s.user?.email ?? ""}</p>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {s.floors.map((f, i) => (
                        <span key={i} className="text-[10.5px] px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-bold">
                          Floor {f.floor_number}{f.building ? ` · ${f.building}` : ""}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[11.5px] text-slate-500">{s.scheduled_start} – {s.scheduled_end}</p>
                    <p className={`text-[11px] font-bold mt-0.5 ${
                      s.actual_end ? "text-slate-400" : s.actual_start ? "text-emerald-600" : "text-amber-600"
                    }`}>
                      {s.actual_end ? `Ended ${new Date(s.actual_end).toLocaleTimeString()}`
                        : s.actual_start ? `Active since ${new Date(s.actual_start).toLocaleTimeString()}`
                        : "Not yet started"}
                    </p>
                    <p className="text-[10.5px] text-slate-400 mt-0.5">
                      {s.rooms_validated} validated · {s.rooms_skipped} skipped
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Assign modal */}
      {assignOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 sm:p-6" onClick={() => setAssignOpen(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md px-7 py-7 sm:px-8 sm:py-8" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-title text-[#001c43] mb-1.5">Assign {tab === "checker" ? "checker" : "guard"} shift</h2>
            <p className="text-[12.5px] text-slate-500 mb-6">For {date}</p>

            <p className="text-overline mb-2">Staff member</p>
            <select
              value={selUserId}
              onChange={(e) => setSelUserId(e.target.value)}
              className="w-full px-4 py-3 min-h-[44px] rounded-xl border border-slate-200 text-[13px] mb-5"
            >
              <option value="">Select a {tab}…</option>
              {filteredOptions.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name} — {u.email}
                </option>
              ))}
            </select>

            <div className="grid grid-cols-2 gap-4 mb-5">
              <div>
                <p className="text-overline mb-2">Start</p>
                <input
                  type="time"
                  value={selStart}
                  onChange={(e) => setSelStart(e.target.value)}
                  className="w-full px-4 py-3 min-h-[44px] rounded-xl border border-slate-200 text-[13px]"
                />
              </div>
              <div>
                <p className="text-overline mb-2">End</p>
                <input
                  type="time"
                  value={selEnd}
                  onChange={(e) => setSelEnd(e.target.value)}
                  className="w-full px-4 py-3 min-h-[44px] rounded-xl border border-slate-200 text-[13px]"
                />
              </div>
            </div>

            <p className="text-overline mb-2">Floors</p>
            <div className="flex gap-2 mb-5">
              {FLOOR_OPTIONS.map((f) => {
                const on = selFloors.includes(f);
                return (
                  <button
                    key={f}
                    onClick={() =>
                      setSelFloors((cur) => (on ? cur.filter((x) => x !== f) : [...cur, f]))
                    }
                    className={`flex-1 py-2.5 rounded-xl text-[12px] font-bold border ${
                      on ? "border-[#114b9f] bg-blue-50 text-[#114b9f]" : "border-slate-200 text-slate-600"
                    }`}
                  >
                    Floor {f}
                  </button>
                );
              })}
            </div>

            {error && <p className="mb-4 text-[12px] text-rose-600 bg-rose-50 px-3.5 py-2.5 rounded-lg">{error}</p>}

            <div className="flex gap-3 mt-2">
              <button onClick={() => setAssignOpen(false)} className="flex-1 py-3 min-h-[44px] rounded-xl text-[13px] font-bold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
              <button onClick={submitAssign} disabled={busy} className="btn-primary flex-1 min-h-[44px] rounded-xl text-[13px]">
                {busy ? "Assigning…" : "Assign shift"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-[60] bg-[#001c43] text-white px-5 py-3 rounded-xl shadow-2xl text-[13px] font-bold flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
          {toast}
        </div>
      )}
    </div>
  );
}
