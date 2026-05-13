"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import EmptyState from "@/components/ui/empty-state";

type Modality = "f2f" | "blended" | "online";

type Session = {
  id: string;
  session_date: string;
  status:
    | "scheduled"
    | "pending"
    | "active"
    | "en_route"
    | "completed"
    | "early_end"
    | "absent"
    | "overstay"
    | "checker_flagged";
  actual_modality: Modality | null;
  actual_start: string | null;
  actual_end: string | null;
  duration_minutes: number | null;
  schedule: {
    course_code: string;
    course_name: string;
    section: string | null;
    enrolled_count: number;
    scheduled_modality: Modality;
    start_time: string;
    end_time: string;
  } | null;
  room: { room_code: string; building: string; floor_number: number } | null;
};

type Dispute = {
  id: string;
  session_id: string;
  status: "pending" | "approved" | "denied" | "escalated";
};

type Filter = "all" | "completed" | "early_end" | "absent" | "approved";

const FILTER_LABELS: Record<Filter, string> = {
  all: "All",
  completed: "Completed",
  early_end: "Early Dismissal",
  absent: "Ghosted",
  approved: "Dispute Approved",
};

const MOD_LABEL: Record<Modality, string> = { f2f: "F2F", blended: "Hybrid", online: "Online" };

function StatusPill({ status, hasApprovedDispute }: { status: Session["status"]; hasApprovedDispute?: boolean }) {
  if (hasApprovedDispute) {
    return <Pill bg="#dbeafe" fg="#1e40af" dot="#3b82f6" label="Dispute Approved" />;
  }
  if (status === "completed") return <Pill bg="#d1fae5" fg="#047857" dot="#10b981" label="Completed" />;
  if (status === "early_end") return <Pill bg="#ffedd5" fg="#c2410c" dot="#f97316" label="Early Dismissal" />;
  if (status === "absent" || status === "checker_flagged") return <Pill bg="#fee2e2" fg="#b91c1c" dot="#ef4444" label="Ghosted" />;
  if (status === "active") return <Pill bg="#d1fae5" fg="#047857" dot="#10b981" label="Active" />;
  if (status === "en_route") return <Pill bg="#ffedd5" fg="#c2410c" dot="#f97316" label="En Route" />;
  return <Pill bg="#f1f5f9" fg="#64748b" dot="#94a3b8" label={status} />;
}

function Pill({ bg, fg, dot, label }: { bg: string; fg: string; dot: string; label: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold capitalize"
      style={{ background: bg, color: fg }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: dot }} />
      {label}
    </span>
  );
}

function ModalityBadge({ m }: { m: Modality }) {
  const c = m === "f2f" ? "badge-f2f" : m === "blended" ? "badge-hybrid" : "badge-online";
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${c}`}>{MOD_LABEL[m]}</span>;
}

export default function AttendanceHistoryPage() {
  const [me, setMe] = useState<{ id: string; full_name: string; department: string | null } | null>(null);
  const [records, setRecords] = useState<Session[]>([]);
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [openDisputeForId, setOpenDisputeForId] = useState<string | null>(null);
  const [reasonCategory, setReasonCategory] = useState<"wlan_issue" | "camera_issue" | "schedule_error" | "checker_error" | "other">("wlan_issue");
  const [explanation, setExplanation] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [meRes, sessRes, dispRes] = await Promise.all([
        fetch("/apis/users/me", { cache: "no-store" }),
        fetch("/apis/sessions", { cache: "no-store" }),
        fetch("/apis/disputes", { cache: "no-store" }),
      ]);
      const meJson = await meRes.json();
      const sessJson = await sessRes.json();
      const dispJson = await dispRes.json();
      setMe(meJson?.user ?? null);
      // API already filters by RLS / role; faculty only sees their own
      setRecords(sessJson?.sessions ?? []);
      setDisputes(dispJson?.disputes ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Map session_id → dispute
  const disputeBySession = useMemo(() => {
    const m = new Map<string, Dispute>();
    disputes.forEach((d) => m.set(d.session_id, d));
    return m;
  }, [disputes]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const fromTs = dateFrom ? new Date(dateFrom + "T00:00:00").getTime() : null;
    const toTs = dateTo ? new Date(dateTo + "T23:59:59").getTime() : null;

    return records.filter((r) => {
      const dispute = disputeBySession.get(r.id);

      // Status filter
      if (filter === "approved" && dispute?.status !== "approved") return false;
      if (filter === "completed" && !(r.status === "completed" && dispute?.status !== "approved")) return false;
      if (filter === "early_end" && r.status !== "early_end") return false;
      if (filter === "absent" && !(r.status === "absent" || r.status === "checker_flagged")) return false;

      // Date filter
      if (fromTs || toTs) {
        const ts = new Date(r.session_date).getTime();
        if (fromTs && ts < fromTs) return false;
        if (toTs && ts > toTs) return false;
      }

      // Search (course code, name, room)
      if (q) {
        const hay = [
          r.schedule?.course_code ?? "",
          r.schedule?.course_name ?? "",
          r.schedule?.section ?? "",
          r.room?.room_code ?? "",
          r.room?.building ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }

      return true;
    });
  }, [records, filter, disputeBySession, search, dateFrom, dateTo]);

  const filtersActive = filter !== "all" || search.trim() !== "" || dateFrom !== "" || dateTo !== "";

  const resetFilters = () => {
    setFilter("all");
    setSearch("");
    setDateFrom("");
    setDateTo("");
  };

  const canDispute = (r: Session) => {
    if (disputeBySession.has(r.id)) return false;
    return r.status === "early_end" || r.status === "absent" || r.status === "checker_flagged";
  };

  function fmtTime(iso: string | null) {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", hour12: true });
  }
  function fmtDate(d: string) {
    const dd = new Date(d);
    return dd.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
  }
  function fmtDuration(min: number | null) {
    if (min == null) return "—";
    const h = Math.floor(min / 60);
    const m = min % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  }

  function escapeCsvCell(value: string | number | null | undefined): string {
    if (value === null || value === undefined) return "";
    const s = String(value);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }

  function downloadFile(content: string, filename: string, mime: string) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function exportCsv() {
    if (filtered.length === 0) {
      showToast("Nothing to export — filters returned 0 records.");
      return;
    }
    const headers = [
      "Date",
      "Course Code",
      "Course Name",
      "Section",
      "Room",
      "Modality",
      "Status",
      "Scheduled Start",
      "Scheduled End",
      "Actual Start",
      "Actual End",
      "Duration (min)",
      "Dispute Status",
    ];
    const rows = filtered.map((r) => {
      const dispute = disputeBySession.get(r.id);
      return [
        r.session_date,
        r.schedule?.course_code ?? "",
        r.schedule?.course_name ?? "",
        r.schedule?.section ?? "",
        r.room?.room_code ?? "",
        r.actual_modality ?? r.schedule?.scheduled_modality ?? "",
        r.status,
        r.schedule?.start_time ?? "",
        r.schedule?.end_time ?? "",
        r.actual_start ?? "",
        r.actual_end ?? "",
        r.duration_minutes ?? "",
        dispute?.status ?? "",
      ]
        .map(escapeCsvCell)
        .join(",");
    });
    const csv = [headers.join(","), ...rows].join("\r\n");
    const stamp = new Date().toISOString().slice(0, 10);
    downloadFile(csv, `attendance-${stamp}.csv`, "text/csv;charset=utf-8");
    setExportMenuOpen(false);
    showToast(`Exported ${filtered.length} record${filtered.length === 1 ? "" : "s"}.`);
  }

  function exportJson() {
    if (filtered.length === 0) {
      showToast("Nothing to export — filters returned 0 records.");
      return;
    }
    const payload = filtered.map((r) => ({
      ...r,
      dispute_status: disputeBySession.get(r.id)?.status ?? null,
    }));
    const stamp = new Date().toISOString().slice(0, 10);
    downloadFile(JSON.stringify(payload, null, 2), `attendance-${stamp}.json`, "application/json");
    setExportMenuOpen(false);
    showToast(`Exported ${filtered.length} record${filtered.length === 1 ? "" : "s"}.`);
  }

  function openDispute(sessionId: string) {
    setOpenDisputeForId(sessionId);
    setReasonCategory("wlan_issue");
    setExplanation("");
    setErrorMsg(null);
  }

  async function submitDispute() {
    if (!openDisputeForId) return;
    if (explanation.trim().length < 50) {
      setErrorMsg("Explanation must be at least 50 characters.");
      return;
    }
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/apis/disputes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          session_id: openDisputeForId,
          reason_category: reasonCategory,
          explanation: explanation.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error?.message ?? data?.error ?? `HTTP ${res.status}`);
      }
      // Refresh disputes
      const dispRes = await fetch("/apis/disputes", { cache: "no-store" });
      const dispJson = await dispRes.json();
      setDisputes(dispJson?.disputes ?? []);
      setOpenDisputeForId(null);
      setExplanation("");
      showToast("Dispute submitted — pending HR review.");
    } catch (e) {
      setErrorMsg(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col fade-up">
            <div className="px-4 sm:px-6 lg:px-8 pb-6 lg:pb-8">
        <div className="card-surface p-5 lg:p-6">
          <div className="flex items-start justify-between flex-wrap gap-3 mb-5">
            <div className="flex items-center gap-3">
              <span className="w-12 h-12 rounded-xl bg-blue-50 text-[#114b9f] flex items-center justify-center">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </span>
              <div>
                <h1 className="text-headline text-[#001c43]">Attendance History</h1>
                <p className="text-[12.5px] text-slate-500 mt-0.5">
                  Current Academic Term — 2nd Semester 2025–2026 ·{" "}
                  <span className="font-bold">{filtered.length}</span>
                  {filtered.length !== records.length && (
                    <span className="text-slate-400"> of {records.length}</span>
                  )}{" "}
                  records
                </p>
              </div>
            </div>

            {/* Export dropdown */}
            <div className="relative">
              <button
                onClick={() => setExportMenuOpen((v) => !v)}
                className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl text-[13px] font-bold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300 hover:shadow-sm transition-all"
                aria-haspopup="menu"
                aria-expanded={exportMenuOpen}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Export
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`transition-transform ${exportMenuOpen ? "rotate-180" : ""}`}>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {exportMenuOpen && (
                <>
                  <button
                    type="button"
                    aria-label="Close export menu"
                    className="fixed inset-0 z-30"
                    onClick={() => setExportMenuOpen(false)}
                  />
                  <div className="absolute right-0 top-full mt-2 w-56 rounded-xl bg-white border border-slate-200 shadow-lg z-40 overflow-hidden">
                    <button
                      onClick={exportCsv}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 text-left"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-600">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                      <span>
                        <span className="block text-[13px] font-bold text-[#001c43]">Export as CSV</span>
                        <span className="block text-[11px] text-slate-400">For Excel / Sheets</span>
                      </span>
                    </button>
                    <button
                      onClick={exportJson}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 text-left border-t border-slate-100"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-600">
                        <polyline points="16 18 22 12 16 6" />
                        <polyline points="8 6 2 12 8 18" />
                      </svg>
                      <span>
                        <span className="block text-[13px] font-bold text-[#001c43]">Export as JSON</span>
                        <span className="block text-[11px] text-slate-400">For developers / backup</span>
                      </span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Search + date range row */}
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto_auto] gap-2.5 mb-4">
            <div className="relative">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search course, room, section…"
                className="w-full pl-10 pr-9 py-2.5 min-h-[44px] rounded-xl border border-slate-200 bg-white text-[13px] focus:outline-none focus:border-[#114b9f] focus-ring transition-shadow"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              max={dateTo || undefined}
              aria-label="From date"
              className="px-3.5 py-2.5 min-h-[44px] rounded-xl border border-slate-200 bg-white text-[13px] text-slate-700 focus:outline-none focus:border-[#114b9f] focus-ring"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              min={dateFrom || undefined}
              aria-label="To date"
              className="px-3.5 py-2.5 min-h-[44px] rounded-xl border border-slate-200 bg-white text-[13px] text-slate-700 focus:outline-none focus:border-[#114b9f] focus-ring"
            />
            {filtersActive && (
              <button
                onClick={resetFilters}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 min-h-[44px] rounded-xl border border-slate-200 bg-white text-[12.5px] font-bold text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
                Reset
              </button>
            )}
          </div>

          {/* Status pill row */}
          <div className="flex flex-wrap gap-2 p-1.5 bg-slate-50 rounded-xl">
            {(Object.keys(FILTER_LABELS) as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-2 min-h-[36px] rounded-lg text-[12.5px] font-bold transition-all duration-200 ${
                  filter === f ? "bg-white text-[#001c43] shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {FILTER_LABELS[f]}
              </button>
            ))}
          </div>
        </div>

        {/* Records list */}
        <div className="mt-4 space-y-2.5">
          {loading && Array.from({ length: 5 }).map((_, i) => <div key={i} className="card-surface px-5 py-4 h-24 skeleton" />)}
          {!loading && filtered.map((r, i) => {
            const dispute = disputeBySession.get(r.id);
            const isApproved = dispute?.status === "approved";
            const mod = r.actual_modality ?? r.schedule?.scheduled_modality ?? "f2f";
            return (
              <div key={r.id} className="card-surface px-5 lg:px-6 py-4 lift fade-up" style={{ animationDelay: `${i * 30}ms` }}>
                <div className="flex items-start gap-3 sm:gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-[13.5px] font-bold text-[#001c43] leading-tight">
                      {r.schedule?.course_code ?? "?"}: {r.schedule?.course_name ?? "?"}
                    </p>
                    <p className="text-[11.5px] text-slate-500 mt-0.5">
                      {fmtDate(r.session_date)} · Room {r.room?.room_code ?? "—"}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-slate-600">
                      <span><span className="text-slate-400">Start:</span> <span className="font-bold text-[#001c43]">{fmtTime(r.actual_start)}</span></span>
                      <span><span className="text-slate-400">End:</span> <span className="font-bold text-[#001c43]">{fmtTime(r.actual_end)}</span></span>
                      <span><span className="text-slate-400">Duration:</span> <span className="font-bold text-[#001c43]">{fmtDuration(r.duration_minutes)}</span></span>
                      <ModalityBadge m={mod} />
                    </div>
                    {dispute && !isApproved && (
                      <p className="mt-2 text-[11px] text-blue-700 font-bold">
                        Dispute: <span className="capitalize">{dispute.status}</span>
                      </p>
                    )}
                    {canDispute(r) && (
                      <button
                        onClick={() => openDispute(r.id)}
                        className="mt-2 inline-flex items-center gap-1.5 text-[11.5px] font-bold text-orange-600 hover:text-orange-700"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                        </svg>
                        File Dispute (within 72 hours)
                      </button>
                    )}
                  </div>
                  <div className="shrink-0">
                    <StatusPill status={r.status} hasApprovedDispute={isApproved} />
                  </div>
                </div>
              </div>
            );
          })}

          {!loading && filtered.length === 0 && (
            <div className="card-surface">
              <EmptyState
                title={!filtersActive ? "No attendance records yet" : "No records match these filters"}
                body={!filtersActive
                  ? "Records appear here as you start and end sessions."
                  : "Adjust your search, date range, or status filter — or reset all filters."}
                action={filtersActive ? { label: "Reset filters", onClick: resetFilters } : undefined}
              />
            </div>
          )}
        </div>
      </div>

      {/* Dispute modal */}
      {openDisputeForId && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 sm:p-6" onClick={() => setOpenDisputeForId(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md px-7 py-7 sm:px-8 sm:py-8" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-title text-[#001c43] mb-1.5">File attendance dispute</h2>
            <p className="text-[12.5px] text-slate-500 mb-6">HR will review and decide within 72 hours.</p>

            <p className="text-overline mb-2">Reason</p>
            <select
              value={reasonCategory}
              onChange={(e) => setReasonCategory(e.target.value as typeof reasonCategory)}
              className="w-full px-4 py-3 min-h-[44px] rounded-xl border border-slate-200 text-[13px] mb-5 focus:outline-none focus:border-[#114b9f]"
            >
              <option value="wlan_issue">WLAN issue — not connected to campus network</option>
              <option value="camera_issue">Camera issue — device camera malfunctioned</option>
              <option value="schedule_error">Schedule error — incorrect class record</option>
              <option value="checker_error">Checker error — verification was incorrect</option>
              <option value="other">Other</option>
            </select>

            <p className="text-overline mb-2">Explanation (50 characters minimum)</p>
            <textarea
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              rows={4}
              placeholder="Describe what happened…"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 text-[13px] focus:outline-none focus:border-[#114b9f] mb-2 resize-none"
            />
            <p className="text-[11px] text-slate-400 mb-5">{explanation.trim().length} / 50 characters</p>

            {errorMsg && <p className="mb-4 text-[12px] text-rose-600 bg-rose-50 px-3.5 py-2.5 rounded-lg">{errorMsg}</p>}

            <div className="flex gap-3 mt-2">
              <button onClick={() => setOpenDisputeForId(null)} className="flex-1 py-3 min-h-[44px] rounded-xl text-[13px] font-bold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
              <button onClick={submitDispute} disabled={busy} className="btn-primary flex-1 min-h-[44px] rounded-xl text-[13px]">
                {busy ? "Submitting…" : "Submit dispute"}
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
