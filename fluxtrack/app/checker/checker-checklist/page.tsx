"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import EmptyState from "@/components/ui/empty-state";
import KebabMenu from "@/components/ui/kebab-menu";

type Modality = "f2f" | "blended" | "online";
type SessionStatus =
  | "scheduled" | "pending" | "active" | "en_route"
  | "completed" | "early_end" | "absent" | "overstay" | "checker_flagged";

type Shift = {
  id: string;
  user_id: string;
  shift_date: string;
  scheduled_start: string;
  scheduled_end: string;
  actual_start: string | null;
  actual_end: string | null;
  rooms_validated: number;
  rooms_skipped: number;
  floors: Array<{ floor_number: number; building: string | null }>;
};

type Session = {
  id: string;
  status: SessionStatus;
  actual_modality: Modality | null;
  actual_start: string | null;
  actual_end: string | null;
  photo_submitted: boolean;
  faculty_id: string;
  schedule: {
    course_code: string;
    course_name: string;
    end_time: string;
  } | null;
  room: {
    room_code: string;
    building: string;
    floor_number: number;
  } | null;
  faculty?: { full_name: string } | null;
};

type Validation = {
  id: string;
  session_id: string;
  action: "verified" | "flagged_absent" | "could_not_access";
};

const CNA_LABEL: Record<string, string> = {
  room_locked: "Room Locked",
  restricted_access: "Restricted Access",
  room_not_found: "Room Not Found",
  other: "Other",
};
const CNA_OPTIONS: Array<keyof typeof CNA_LABEL> = ["room_locked", "restricted_access", "room_not_found", "other"];

function ModalityBadge({ m }: { m: Modality | null }) {
  if (!m) return null;
  if (m === "f2f") return <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold">F2F</span>;
  if (m === "blended") return <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-100 text-violet-800 font-bold">Hybrid</span>;
  return <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-800 font-bold">Online</span>;
}

function StatusBadge({ s }: { s: SessionStatus }) {
  if (s === "active") return <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold">Active</span>;
  if (s === "scheduled" || s === "pending") return <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold">Pending</span>;
  if (s === "overstay") return <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-200 text-rose-900 border border-rose-400 font-bold animate-pulse">OVERSTAY</span>;
  if (s === "en_route") return <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 font-bold">En Route</span>;
  return <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-bold capitalize">{s.replace("_", " ")}</span>;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function CheckerChecklist() {
  const [me, setMe] = useState<{ id: string; full_name: string } | null>(null);
  const [shift, setShift] = useState<Shift | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [validations, setValidations] = useState<Validation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Per-session UI state (during the active flow)
  const [flagFor, setFlagFor] = useState<Session | null>(null);
  const [flagNote, setFlagNote] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  function showToast(m: string) { setToast(m); setTimeout(() => setToast(null), 2500); }

  // Load: me, today's shift for me, sessions today on assigned floors, validations
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [meRes, shiftRes, sessRes] = await Promise.all([
        fetch("/apis/users/me", { cache: "no-store" }),
        fetch(`/apis/checker/shifts?date=${todayStr()}`, { cache: "no-store" }),
        fetch(`/apis/sessions?date=${todayStr()}`, { cache: "no-store" }),
      ]);
      const meJson = await meRes.json();
      const shiftJson = await shiftRes.json();
      const sessJson = await sessRes.json();
      setMe(meJson?.user ?? null);

      // Find this checker's shift today
      const myShift: Shift | null = (shiftJson?.shifts ?? []).find(
        (s: Shift) => s.user_id === meJson?.user?.id,
      ) ?? null;
      setShift(myShift);

      const floors = new Set((myShift?.floors ?? []).map((f) => f.floor_number));
      const allSessions: Session[] = sessJson?.sessions ?? [];
      // Only sessions in checker's assigned floors, that are checkable
      const visible = allSessions.filter((s) =>
        s.room && floors.has(s.room.floor_number) &&
        ["scheduled", "pending", "active", "overstay", "en_route", "checker_flagged"].includes(s.status),
      );
      setSessions(visible);

      // Validations for these sessions (one fetch with no filter — small set)
      const valRes = await fetch("/apis/checker/validations", { cache: "no-store" });
      const valJson = await valRes.json();
      setValidations(valJson?.validations ?? []);
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const validatedSessionIds = useMemo(() => {
    const m = new Map<string, Validation>();
    validations.forEach((v) => m.set(v.session_id, v));
    return m;
  }, [validations]);

  const sortedSessions = useMemo(() => {
    return [...sessions].sort((a, b) => {
      // Pending first, then overstay, then active, then others
      const order = { pending: 0, scheduled: 0, overstay: 1, active: 2, en_route: 3, checker_flagged: 4 } as Record<string, number>;
      return (order[a.status] ?? 99) - (order[b.status] ?? 99);
    });
  }, [sessions]);

  const verifiedCount = useMemo(
    () => sortedSessions.filter((s) => validatedSessionIds.get(s.id)?.action === "verified").length,
    [sortedSessions, validatedSessionIds],
  );
  const flaggedCount = useMemo(
    () => sortedSessions.filter((s) => validatedSessionIds.get(s.id)?.action === "flagged_absent").length,
    [sortedSessions, validatedSessionIds],
  );
  const skippedCount = useMemo(
    () => sortedSessions.filter((s) => validatedSessionIds.get(s.id)?.action === "could_not_access").length,
    [sortedSessions, validatedSessionIds],
  );
  const pendingCount = sortedSessions.length - verifiedCount - flaggedCount - skippedCount;
  const allDone = sortedSessions.length > 0 && pendingCount === 0;

  // ─── Actions ───────────────────────────────────────────────────────────────
  async function startShift() {
    if (!shift) return;
    setError(null);
    try {
      const res = await fetch(`/apis/checker/shifts/${shift.id}/start`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message ?? data?.error ?? `HTTP ${res.status}`);
      setShift(data.shift);
      showToast("Shift started.");
    } catch (e) {
      setError(String((e as Error).message));
    }
  }

  async function endShift() {
    if (!shift) return;
    setError(null);
    try {
      const res = await fetch(`/apis/checker/shifts/${shift.id}/end`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message ?? data?.error ?? `HTTP ${res.status}`);
      setShift(data.shift);
      showToast("Shift ended.");
    } catch (e) {
      setError(String((e as Error).message));
    }
  }

  async function postValidation(sessionId: string, body: Record<string, unknown>) {
    setBusyId(sessionId);
    setError(null);
    try {
      const res = await fetch("/apis/checker/validations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message ?? data?.error ?? `HTTP ${res.status}`);
      // Refresh validations + shift counts
      const [valRes, shiftRes] = await Promise.all([
        fetch("/apis/checker/validations", { cache: "no-store" }),
        fetch(`/apis/checker/shifts?date=${todayStr()}`, { cache: "no-store" }),
      ]);
      const valJson = await valRes.json();
      const shiftJson = await shiftRes.json();
      setValidations(valJson?.validations ?? []);
      const myShift = (shiftJson?.shifts ?? []).find((s: Shift) => s.user_id === me?.id) ?? null;
      setShift(myShift);
      // Reload sessions in case the flag flipped status to checker_flagged
      const sessRes = await fetch(`/apis/sessions?date=${todayStr()}`, { cache: "no-store" });
      const sessJson = await sessRes.json();
      const floors = new Set((myShift?.floors ?? []).map((f: { floor_number: number }) => f.floor_number));
      setSessions((sessJson?.sessions ?? []).filter((s: Session) =>
        s.room && floors.has(s.room.floor_number) &&
        ["scheduled", "pending", "active", "overstay", "en_route", "checker_flagged"].includes(s.status),
      ));
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusyId(null);
    }
  }

  async function verify(s: Session) {
    await postValidation(s.id, { session_id: s.id, action: "verified" });
    showToast(`Verified Room ${s.room?.room_code}`);
  }
  async function confirmFlag() {
    if (!flagFor) return;
    if (flagNote.trim().length < 10) { setError("Note must be at least 10 characters."); return; }
    await postValidation(flagFor.id, { session_id: flagFor.id, action: "flagged_absent", note: flagNote.trim() });
    setFlagFor(null);
    setFlagNote("");
    showToast(`Flagged Room ${flagFor.room?.room_code}`);
  }
  async function cna(s: Session, reason: string) {
    await postValidation(s.id, { session_id: s.id, action: "could_not_access", cna_reason: reason });
    showToast(`Skipped Room ${s.room?.room_code} — ${CNA_LABEL[reason]}`);
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-full bg-slate-50 p-4 space-y-3">
        <div className="h-24 skeleton rounded-xl" />
        <div className="h-32 skeleton rounded-xl" />
        <div className="h-32 skeleton rounded-xl" />
      </div>
    );
  }

  // Shift overlay — show when there's no shift OR the shift hasn't started
  if (!shift) {
    return (
      <div className="min-h-full bg-slate-50 p-4 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-md w-full max-w-sm p-6 text-center">
          <p className="text-base font-bold text-[#001c43] mb-2">No shift assigned today</p>
          <p className="text-xs text-slate-500">Ask IFO to assign you a floor for today, then refresh.</p>
        </div>
      </div>
    );
  }

  if (!shift.actual_start) {
    return (
      <div className="min-h-full bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-md w-full max-w-sm p-6">
          <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center mb-4">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#114b9f" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
          </div>
          <h2 className="text-xl font-bold text-[#001c43] mb-1">Start My Shift</h2>
          <p className="text-slate-500 text-sm mb-4">You are about to begin your floor checking shift.</p>
          <div className="bg-slate-50 rounded-xl p-4 mb-5 space-y-2 border border-slate-200">
            <Row k="Assignment" v={shift.floors.map((f) => `Floor ${f.floor_number}${f.building ? " · " + f.building : ""}`).join(", ") || "—"} />
            <Row k="Scheduled Start" v={shift.scheduled_start} />
            <Row k="Sessions to Check" v={String(sessions.length)} />
          </div>
          {error && <p className="mb-3 text-[12px] text-rose-600 bg-rose-50 px-3 py-2 rounded-lg">{error}</p>}
          <button onClick={startShift} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl text-sm">
            Start My Shift
          </button>
        </div>
      </div>
    );
  }

  // ─── Active shift UI ───────────────────────────────────────────────────────
  return (
    <div className="min-h-full bg-slate-50 p-4 space-y-4">
      {/* Progress card */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-bold text-[#001c43]">
            Floor {shift.floors.map((f) => f.floor_number).join(", ")} progress
          </span>
          <span className="text-xs text-slate-500">{verifiedCount} of {sortedSessions.length} validated</span>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-2 mb-2 overflow-hidden">
          <div
            className="h-2 rounded-full bg-blue-600 transition-all"
            style={{ width: sortedSessions.length === 0 ? "0%" : `${(verifiedCount / sortedSessions.length) * 100}%` }}
          />
        </div>
        <div className="flex gap-3 text-[11px] flex-wrap">
          <span className="text-amber-600 font-bold">{pendingCount} pending</span>
          <span className="text-slate-400">·</span>
          <span className="text-slate-500">{skippedCount} skipped</span>
          <span className="text-slate-400">·</span>
          <span className="text-rose-600 font-bold">{flaggedCount} flagged</span>
          <span className="text-slate-400">·</span>
          <span className="text-emerald-700 font-bold">{verifiedCount} verified</span>
        </div>
      </div>

      {allDone && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 text-center">
          <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
          </div>
          <p className="text-base font-bold text-emerald-800">All sessions checked!</p>
          <p className="text-sm text-emerald-700 mt-1">{verifiedCount} verified · {flaggedCount} flagged · {skippedCount} skipped</p>
          <button
            onClick={endShift}
            className="mt-4 px-6 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700"
          >
            End Shift
          </button>
        </div>
      )}

      {/* Session cards */}
      <div className="space-y-3">
        {sortedSessions.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-xl">
            <EmptyState
              title="No sessions on your floor today"
              body="Either nothing is scheduled, or every session has already been validated. Take a break!"
            />
          </div>
        )}
        {sortedSessions.map((s) => {
          const v = validatedSessionIds.get(s.id);
          const state = v?.action ?? "pending";
          const busy = busyId === s.id;
          return (
            <div
              key={s.id}
              className={`bg-white border rounded-xl shadow-sm p-4 ${
                state === "verified" ? "border-emerald-200 bg-emerald-50/40" :
                state === "flagged_absent" ? "border-rose-200 bg-rose-50/40" :
                state === "could_not_access" ? "border-slate-200 opacity-70" :
                "border-slate-200"
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-3">
                  <span className="text-3xl font-bold text-[#001c43]">{s.room?.room_code}</span>
                  <StatusBadge s={s.status} />
                </div>
                {state === "verified" && <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-600 text-white font-bold">✓ Verified</span>}
                {state === "flagged_absent" && <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-600 text-white font-bold">Flagged</span>}
                {state === "could_not_access" && <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-500 text-white font-bold">Skipped</span>}
              </div>

              <div className="mb-2">
                <p className="text-sm font-bold text-[#001c43]">{s.faculty?.full_name ?? "—"}</p>
                <p className="text-xs text-slate-500">{s.schedule?.course_code} — {s.schedule?.course_name}</p>
              </div>

              <div className="flex items-center gap-2 flex-wrap mb-3">
                <ModalityBadge m={s.actual_modality} />
                {s.photo_submitted && <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-bold">📷 Photo</span>}
                {s.schedule?.end_time && <span className="text-[11px] text-slate-500">Ends {s.schedule.end_time.slice(0,5)}</span>}
              </div>

              {state === "pending" && (
                <div className="flex items-center gap-2">
                  <button
                    disabled={busy}
                    onClick={() => verify(s)}
                    className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg border border-emerald-300 text-emerald-700 text-sm font-bold hover:bg-emerald-50 disabled:opacity-50"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                    Verify
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => { setFlagFor(s); setFlagNote(""); setError(null); }}
                    className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg border border-rose-300 text-rose-700 text-sm font-bold hover:bg-rose-50 disabled:opacity-50"
                  >
                    Flag Absent
                  </button>
                  <KebabMenu
                    label="Could Not Access"
                    triggerLabel="More actions"
                    items={CNA_OPTIONS.map((reason) => ({ value: reason, label: CNA_LABEL[reason] }))}
                    onSelect={(reason) => cna(s, reason as string)}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!allDone && sortedSessions.length > 0 && (
        <button
          onClick={endShift}
          className="w-full px-4 py-3 rounded-xl bg-slate-100 text-slate-700 text-sm font-bold border border-slate-200 hover:bg-slate-200"
        >
          End Shift early ({pendingCount} pending)
        </button>
      )}

      {error && (
        <div className="fixed bottom-20 left-4 right-4 z-50 px-4 py-3 rounded-xl bg-rose-50 border border-rose-200 text-[12.5px] text-rose-700 font-bold">
          {error}
        </div>
      )}

      {/* Flag modal */}
      {flagFor && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setFlagFor(null)}>
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-[#001c43] mb-1">Flag as Absent</h3>
            <p className="text-xs text-slate-500 mb-4">Room {flagFor.room?.room_code} — {flagFor.faculty?.full_name}</p>
            <div className="mb-4">
              <label className="text-xs font-bold text-slate-700 mb-1.5 block">
                Note <span className="text-rose-500">*</span> <span className="text-slate-400 font-normal">(min 10 chars)</span>
              </label>
              <textarea
                value={flagNote}
                onChange={(e) => setFlagNote(e.target.value)}
                placeholder="Describe what you observed…"
                rows={3}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-rose-400"
              />
              <p className={`text-xs mt-1 text-right ${flagNote.length < 10 ? "text-rose-500" : "text-emerald-600"}`}>
                {flagNote.length} / 10
              </p>
            </div>
            {error && <p className="mb-3 text-[12px] text-rose-600 bg-rose-50 px-3 py-2 rounded-lg">{error}</p>}
            <div className="flex gap-2">
              <button onClick={() => { setFlagFor(null); setFlagNote(""); }} className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 text-slate-700 text-sm font-bold">
                Cancel
              </button>
              <button
                onClick={confirmFlag}
                disabled={flagNote.trim().length < 10 || busyId !== null}
                className="flex-1 px-4 py-2.5 rounded-lg bg-rose-600 text-white text-sm font-bold hover:bg-rose-700 disabled:opacity-50"
              >
                {busyId ? "Saving…" : "Confirm Flag"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-20 right-4 z-[60] bg-[#001c43] text-white px-4 py-2.5 rounded-xl shadow-2xl text-[12.5px] font-bold flex items-center gap-2">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
          {toast}
        </div>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-slate-500">{k}</span>
      <span className="font-bold text-[#001c43]">{v}</span>
    </div>
  );
}
