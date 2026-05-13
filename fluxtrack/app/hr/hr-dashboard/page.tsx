"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import RoleTopBar from "@/components/layout/role-topbar";
import EmptyState from "@/components/ui/empty-state";
import { useRealtimeChannel } from "@/hooks/use-realtime-channel";

type Modality = "f2f" | "blended" | "online";
type SessionStatus =
  | "scheduled" | "pending" | "active" | "en_route"
  | "completed" | "early_end" | "absent" | "overstay" | "checker_flagged";

type HrRecord = {
  id: string;
  session_date: string;
  status: SessionStatus;
  actual_modality: Modality | null;
  actual_start: string | null;
  actual_end: string | null;
  duration_minutes: number | null;
  modality_override: boolean;
  faculty_name: string | null;
  faculty_department: string | null;
  faculty_email: string | null;
  room_code: string | null;
  course_code: string | null;
  course_name: string | null;
  scheduled_modality: Modality | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
};

type Summary = {
  total_records: number;
  total_hours: number;
  modality_drift_pct: number;
  drift_session_count: number;
  no_show_count: number;
  compliance_pct: number;
  by_modality: { f2f: number; blended: number; online: number };
  by_status: Record<string, number>;
  daily_hours: Array<{ date: string; day: string; hours: number; target: number }>;
};

type StatusPillKey = "complete" | "no_show" | "early_end" | "dispute" | "active" | "scheduled";
const STATUS_PILL: Record<StatusPillKey, { bg: string; fg: string; dot: string; label: string }> = {
  complete:  { bg: "#d1fae5", fg: "#047857", dot: "#10b981", label: "Complete" },
  no_show:   { bg: "#fee2e2", fg: "#b91c1c", dot: "#ef4444", label: "No Show" },
  early_end: { bg: "#ffedd5", fg: "#c2410c", dot: "#f97316", label: "Early End" },
  dispute:   { bg: "#dbeafe", fg: "#1e40af", dot: "#3b82f6", label: "Dispute" },
  active:    { bg: "#dcfce7", fg: "#15803d", dot: "#22c55e", label: "Active" },
  scheduled: { bg: "#f1f5f9", fg: "#64748b", dot: "#94a3b8", label: "Scheduled" },
};

function pillFor(s: SessionStatus): StatusPillKey {
  if (s === "completed" || s === "overstay") return "complete";
  if (s === "early_end") return "early_end";
  if (s === "absent" || s === "checker_flagged") return "no_show";
  if (s === "active" || s === "en_route") return "active";
  return "scheduled";
}

function todayStr() { return new Date().toISOString().slice(0, 10); }
function daysAgoStr(n: number) {
  const d = new Date(); d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function fmtTime(t: string | null) {
  if (!t) return "—";
  // could be "HH:MM:SS" or ISO
  if (t.length <= 8 && t.includes(":")) return t.slice(0, 5);
  return new Date(t).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", hour12: false });
}
function fmtDate(d: string) { return d; }

export default function HRDashboard() {
  const [me, setMe] = useState<{ full_name: string; department: string | null } | null>(null);
  const [records, setRecords] = useState<HrRecord[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdatedMs, setLastUpdatedMs] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [dept, setDept] = useState("All Departments");
  const [dateFrom, setDateFrom] = useState(daysAgoStr(14));
  const [dateTo, setDateTo] = useState(todayStr());
  // Coalesce realtime bursts: only kick off one refresh per ~750ms even if
  // many sessions update at once (e.g. cron flips a batch).
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (opts: { silent?: boolean } = {}) => {
    if (opts.silent) setRefreshing(true);
    else setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("date_from", dateFrom);
      params.set("date_to", dateTo);
      params.set("limit", "200");
      if (dept !== "All Departments") params.set("dept", dept);
      if (search) params.set("q", search);

      const summaryParams = new URLSearchParams();
      summaryParams.set("date_from", dateFrom);
      summaryParams.set("date_to", dateTo);
      if (dept !== "All Departments") summaryParams.set("dept", dept);

      const [meRes, recordsRes, summaryRes] = await Promise.all([
        fetch("/api/users/me", { cache: "no-store" }),
        fetch(`/api/hr/records?${params.toString()}`, { cache: "no-store" }),
        fetch(`/api/hr/summary?${summaryParams.toString()}`, { cache: "no-store" }),
      ]);
      const meJson = await meRes.json();
      const recordsJson = await recordsRes.json();
      const summaryJson = await summaryRes.json();
      setMe(meJson?.user ?? null);
      setRecords(recordsJson?.records ?? []);
      setSummary(summaryJson ?? null);
      setLastUpdatedMs(Date.now());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dateFrom, dateTo, dept, search]);

  // Initial + filter-change loads (excluding search debouncing for simplicity)
  useEffect(() => {
    const t = setTimeout(() => { load(); }, search ? 350 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  // Realtime: when any session/dispute row mutates, schedule a silent refresh.
  // Using a 750ms debounce so a burst of updates only triggers one fetch.
  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      load({ silent: true });
    }, 750);
  }, [load]);

  useRealtimeChannel({
    name: "hr-dashboard:sessions",
    table: "sessions",
    event: "*",
    onChange: scheduleRefresh,
  });
  useRealtimeChannel({
    name: "hr-dashboard:disputes",
    table: "disputes",
    event: "*",
    onChange: scheduleRefresh,
  });

  return (
    <div className="flex-1 flex flex-col fade-up">
      <RoleTopBar
        greetingName={me?.full_name ?? "HR"}
        department={me?.department ?? "Human Resources"}
        showSettings
      />

      <div className="px-4 sm:px-6 lg:px-8 pb-6 lg:pb-8 space-y-4 lg:space-y-5">
        {/* Period header */}
        <section
          className="rounded-lg lg:rounded-xl p-5 lg:p-6 flex items-start justify-between flex-wrap gap-4 relative overflow-hidden"
          style={{ background: "linear-gradient(135deg, #001c43 0%, #0a2a5a 50%, #114b9f 100%)" }}
        >
          <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full opacity-30 blur-3xl" style={{ background: "radial-gradient(circle, #6366f1 0%, transparent 70%)" }} />
          <div className="absolute -bottom-16 -left-16 w-40 h-40 rounded-full opacity-20 blur-3xl" style={{ background: "radial-gradient(circle, #e50019 0%, transparent 70%)" }} />
          <div className="relative z-10">
            <p className="text-overline text-blue-200">Reporting Period</p>
            <h1 className="text-headline text-white mt-2">Attendance Audit &amp; Payroll Export</h1>
            <p className="text-[13px] text-blue-200/90 mt-1.5 max-w-md">
              {summary ? `${summary.total_records} records · ${summary.total_hours} hrs logged` : "Loading…"}
            </p>
          </div>
          <div
            className="relative z-10 inline-flex items-center gap-2 px-4 py-3 rounded-lg backdrop-blur-sm text-[12.5px] text-white"
            style={{ background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.18)" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="bg-transparent text-white outline-none border-0 font-bold w-[110px] [color-scheme:dark]"
            />
            <span className="text-blue-200">to</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="bg-transparent text-white outline-none border-0 font-bold w-[110px] [color-scheme:dark]"
            />
          </div>
        </section>

        {/* Stat cards (driven by /api/hr/summary) */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
          <StatCard
            label="Total Hours Logged"
            value={summary ? summary.total_hours.toFixed(1) : "—"}
            valueSuffix="hrs"
            delta={summary && summary.total_records > 0 ? `${summary.total_records} records` : undefined}
            accent="#3b82f6"
            icon={<ClockIcon />}
            loading={loading}
          />
          <StatCard
            label="Modality Drift"
            value={summary ? summary.modality_drift_pct.toFixed(1) : "—"}
            valueSuffix="%"
            delta={summary ? `${summary.drift_session_count} sessions with mismatch` : undefined}
            accent="#f97316"
            icon={<TrendIcon />}
            loading={loading}
          />
          <StatCard
            label="No-Show Sessions"
            value={summary ? String(summary.no_show_count) : "—"}
            valueSuffix="sessions"
            accent="#ef4444"
            icon={<AlertIcon />}
            loading={loading}
          />
          <StatCard
            label="Compliance Rate"
            value={summary ? summary.compliance_pct.toFixed(1) : "—"}
            valueSuffix="%"
            delta={summary && summary.compliance_pct >= 90 ? "Above target" : undefined}
            deltaPositive={summary && summary.compliance_pct >= 90 ? true : false}
            accent="#10b981"
            icon={<ShieldIcon />}
            loading={loading}
          />
        </section>

        {/* Charts */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-3 lg:gap-4">
          <div className="lg:col-span-2 card-surface p-5 lg:p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-title text-[#001c43]">Daily Hours Logged</p>
                <p className="text-[11.5px] text-slate-500 mt-0.5">Last 7 days · vs 40h target</p>
              </div>
              <div className="flex items-center gap-3 text-[11px]">
                <Legend dot="#114b9f" label="Actual" />
                <Legend dot="#cbd5e1" label="Target" />
              </div>
            </div>
            <BarChart data={summary?.daily_hours ?? []} loading={loading} />
          </div>
          <div className="card-surface p-5 lg:p-6">
            <p className="text-title text-[#001c43]">Modality Distribution</p>
            <p className="text-[11.5px] text-slate-500 mt-0.5">Across completed sessions</p>
            <DonutChart byModality={summary?.by_modality ?? { f2f: 0, blended: 0, online: 0 }} loading={loading} />
            <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
              {[
                { dot: "#1e3a8a", label: "F2F", v: summary?.by_modality.f2f ?? 0 },
                { dot: "#3b82f6", label: "Online", v: summary?.by_modality.online ?? 0 },
                { dot: "#8a38f5", label: "Hybrid", v: summary?.by_modality.blended ?? 0 },
              ].map((s) => (
                <div key={s.label} className="text-center">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.dot }} />
                    <span className="text-slate-500">{s.label}</span>
                  </span>
                  <p className="font-bold text-[#001c43] mt-0.5">{s.v}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Records table */}
        <section className="card-surface overflow-hidden">
          <header className="flex items-center justify-between gap-3 px-5 lg:px-6 py-4 lg:py-5 border-b border-slate-100 flex-wrap">
            <div className="flex items-center gap-3">
              <span className="w-9 h-9 rounded-xl bg-blue-50 text-[#114b9f] flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </span>
              <div>
                <p className="text-title text-[#001c43]">Attendance Records</p>
                <p className="text-[11.5px] text-slate-500">
                  {records.length} records shown
                  {lastUpdatedMs && (
                    <span className="text-slate-400">
                      {" · updated "}{new Date(lastUpdatedMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      {refreshing && " · refreshing…"}
                    </span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => load({ silent: true })}
                disabled={refreshing || loading}
                title="Refresh records and summary"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:border-slate-300 text-[12px] font-bold text-slate-600 disabled:opacity-50"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className={refreshing ? "animate-spin" : ""}>
                  <polyline points="23 4 23 10 17 10" />
                  <polyline points="1 20 1 14 7 14" />
                  <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
                </svg>
                Refresh
              </button>
              <div className="relative">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  placeholder="Filter by faculty…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full sm:w-[220px] pl-10 pr-4 py-2 rounded-full border border-slate-200 bg-slate-50/50 text-[12px] focus:outline-none focus:bg-white focus:border-[#114b9f] focus-ring"
                />
              </div>
              <select
                value={dept}
                onChange={(e) => setDept(e.target.value)}
                className="px-3 py-2 rounded-full border border-slate-200 bg-slate-50/50 text-[12px] text-slate-700 focus:outline-none focus:bg-white focus:border-[#114b9f] focus-ring"
              >
                <option>All Departments</option>
                <option>College of Computer and Information Science</option>
                <option>College of Business Administration</option>
                <option>College of Engineering</option>
                <option>College of Architecture and Design</option>
                <option>College of Allied Health Sciences</option>
                <option>Institutional Facilities Office</option>
              </select>
            </div>
          </header>

          {/* Mobile card list */}
          <div className="md:hidden divide-y divide-slate-100">
            {loading && records.length === 0 && Array.from({ length: 4 }).map((_, i) => <div key={i} className="px-5 py-4 h-24 skeleton" />)}
            {!loading && records.length === 0 && (
              <EmptyState
                title="No records match the filters"
                body="Try widening the date range, clearing the search, or selecting All Departments."
                action={{
                  label: "Reset filters",
                  onClick: () => { setSearch(""); setDept("All Departments"); },
                }}
              />
            )}
            {records.map((r) => {
              const drifted = r.actual_modality && r.scheduled_modality && r.actual_modality !== r.scheduled_modality;
              return (
                <div key={r.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="min-w-0">
                      <p className="text-[13.5px] font-bold text-[#114b9f] truncate">{r.faculty_name ?? "—"}</p>
                      <p className="text-[11px] text-slate-500">{r.session_date} · {r.faculty_department ?? "—"}</p>
                    </div>
                    <PillFor s={r.status} />
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-[11.5px]">
                    <KV k="Sched" v={fmtTime(r.scheduled_start)} />
                    <KV k="Actual" v={fmtTime(r.actual_start)} tone={r.modality_override ? "warn" : undefined} />
                    <KV k="Sched Mod" v={(r.scheduled_modality ?? "—").toUpperCase()} />
                    <KV k="Actual Mod" v={(r.actual_modality ?? "—").toUpperCase()} tone={drifted ? "warn" : undefined} />
                    <KV k="Hours" v={r.duration_minutes != null ? `${(r.duration_minutes / 60).toFixed(1)}h` : "—"} />
                    <KV k="Room" v={r.room_code ?? "—"} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead style={{ background: "linear-gradient(180deg, #fafbfd 0%, #f3f6fa 100%)" }}>
                <tr className="text-overline">
                  <Th>Date</Th>
                  <Th>Faculty Name</Th>
                  <Th>Dept</Th>
                  <Th>Sched</Th>
                  <Th>Actual</Th>
                  <Th>Sched Mod</Th>
                  <Th>Actual Mod</Th>
                  <Th>Hours</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {loading && records.length === 0 && Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}><td colSpan={9} className="px-4 py-3"><div className="h-6 skeleton" /></td></tr>
                ))}
                {!loading && records.length === 0 && (
                  <tr>
                    <td colSpan={9}>
                      <EmptyState
                        title="No records match the filters"
                        body="Try widening the date range, clearing the search, or selecting All Departments."
                        action={{
                          label: "Reset filters",
                          onClick: () => { setSearch(""); setDept("All Departments"); },
                        }}
                      />
                    </td>
                  </tr>
                )}
                {records.map((r) => {
                  const drifted = r.actual_modality && r.scheduled_modality && r.actual_modality !== r.scheduled_modality;
                  return (
                    <tr key={r.id} className="border-t border-slate-100 table-row-hover">
                      <Td>{fmtDate(r.session_date)}</Td>
                      <Td><span className="font-bold text-[#114b9f]">{r.faculty_name ?? "—"}</span></Td>
                      <Td>
                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-bold">
                          {(r.faculty_department ?? "—").split(" ").map((w) => w[0]).join("").slice(0, 4)}
                        </span>
                      </Td>
                      <Td>{fmtTime(r.scheduled_start)}</Td>
                      <Td>{fmtTime(r.actual_start)}</Td>
                      <Td>{(r.scheduled_modality ?? "—").toUpperCase()}</Td>
                      <Td><span className={drifted ? "text-orange-600 font-bold" : ""}>{(r.actual_modality ?? "—").toUpperCase()}</span></Td>
                      <Td>{r.duration_minutes != null ? `${(r.duration_minutes / 60).toFixed(1)}h` : "0h"}</Td>
                      <Td><PillFor s={r.status} /></Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

function PillFor({ s }: { s: SessionStatus }) {
  const k = pillFor(s);
  const v = STATUS_PILL[k];
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold"
      style={{ background: v.bg, color: v.fg }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: v.dot }} />
      {v.label}
    </span>
  );
}

function StatCard({
  label, value, valueSuffix, delta, deltaPositive, accent, icon, loading,
}: {
  label: string; value: string; valueSuffix?: string; delta?: string;
  deltaPositive?: boolean; accent: string; icon: React.ReactNode; loading?: boolean;
}) {
  return (
    <div className="card-surface p-5 lift relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${accent}0a 0%, white 50%)` }}>
      <div className="absolute -top-12 -right-12 w-24 h-24 rounded-full opacity-15 blur-2xl" style={{ background: accent }} />
      <div className="relative">
        <div className="flex items-start justify-between mb-3">
          <p className="text-overline">{label}</p>
          <span className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${accent}1a`, color: accent }}>
            {icon}
          </span>
        </div>
        {loading ? (
          <div className="h-9 w-24 skeleton" />
        ) : (
          <p className="text-[30px] font-bold leading-none tracking-tight" style={{ color: accent }}>
            {value}
            {valueSuffix && <span className="text-[14px] font-medium text-slate-400 ml-1">{valueSuffix}</span>}
          </p>
        )}
        {delta && (
          <p className={`mt-2.5 text-[11px] font-semibold flex items-center gap-1 ${deltaPositive ? "text-emerald-600" : "text-slate-500"}`}>
            {delta}
          </p>
        )}
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) { return <th className="px-5 py-3.5 text-left">{children}</th>; }
function Td({ children }: { children: React.ReactNode }) { return <td className="px-5 py-3.5 text-slate-700">{children}</td>; }
function KV({ k, v, tone }: { k: string; v: string; tone?: "warn" }) {
  return (
    <div>
      <span className="text-slate-400 text-[10.5px] font-bold uppercase tracking-wider">{k}</span>
      <p className={`font-bold ${tone === "warn" ? "text-rose-600" : "text-[#001c43]"}`}>{v}</p>
    </div>
  );
}
function Legend({ dot, label }: { dot: string; label: string }) {
  return <span className="inline-flex items-center gap-1.5 text-slate-500"><span className="w-2 h-2 rounded-sm" style={{ background: dot }} />{label}</span>;
}

function BarChart({ data, loading }: { data: Array<{ day: string; hours: number; target: number }>; loading: boolean }) {
  if (loading || data.length === 0) {
    return <div className="h-44 flex items-center justify-center text-slate-400 text-xs">{loading ? "Loading…" : "No data"}</div>;
  }
  const max = Math.max(60, ...data.map((d) => Math.max(d.hours, d.target)));
  return (
    <div className="flex items-end gap-3 h-44">
      <div className="flex flex-col justify-between text-[10px] text-slate-400 h-full pb-6 font-medium">
        <span>{Math.round(max)}</span>
        <span>{Math.round(max * 0.75)}</span>
        <span>{Math.round(max * 0.5)}</span>
        <span>{Math.round(max * 0.25)}</span>
        <span>0</span>
      </div>
      <div className="flex-1 grid gap-3 relative" style={{ gridTemplateColumns: `repeat(${data.length}, minmax(0,1fr))` }}>
        <div className="absolute inset-0 pb-6 flex flex-col justify-between pointer-events-none">
          {[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-px bg-slate-100" />)}
        </div>
        {data.map((d, i) => (
          <div key={i} className="flex flex-col items-center justify-end h-full gap-2 relative">
            <div className="flex items-end gap-1.5 w-full h-[88%] pb-0.5">
              <div className="flex-1 rounded-t-md" style={{ height: `${(d.target / max) * 100}%`, background: "linear-gradient(180deg,#e2e8f0 0%,#cbd5e1 100%)" }} title={`Target ${d.target}h`} />
              <div className="flex-1 rounded-t-md shadow-sm" style={{ height: `${(d.hours / max) * 100}%`, background: "linear-gradient(180deg,#114b9f 0%,#001c43 100%)" }} title={`${d.hours}h actual`} />
            </div>
            <span className="text-[10.5px] text-slate-500 font-medium">{d.day}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DonutChart({ byModality, loading }: { byModality: { f2f: number; blended: number; online: number }; loading: boolean }) {
  const total = byModality.f2f + byModality.blended + byModality.online;
  const segments = total === 0
    ? [{ label: "no data", value: 1, color: "#e2e8f0" }]
    : [
        { label: "F2F", value: byModality.f2f, color: "#1e3a8a" },
        { label: "Online", value: byModality.online, color: "#3b82f6" },
        { label: "Hybrid", value: byModality.blended, color: "#8a38f5" },
      ];
  let acc = 0;
  return (
    <div className="flex items-center justify-center my-4 relative h-[160px]">
      {loading ? (
        <div className="w-32 h-32 rounded-full skeleton" />
      ) : (
        <>
          <svg viewBox="0 0 42 42" width="160" height="160">
            <circle cx="21" cy="21" r="15.9" fill="none" stroke="#f1f5f9" strokeWidth="6" />
            {segments.map((s, i) => {
              const dash = total === 0 ? 100 : (s.value / total) * 100;
              const offset = 100 - acc;
              acc += dash;
              return (
                <circle
                  key={i}
                  cx="21" cy="21" r="15.9"
                  fill="none"
                  stroke={s.color}
                  strokeWidth="6"
                  strokeDasharray={`${dash} ${100 - dash}`}
                  strokeDashoffset={offset}
                  transform="rotate(-90 21 21)"
                  strokeLinecap="round"
                />
              );
            })}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <p className="text-[22px] font-bold text-[#001c43] tracking-tight leading-none">{total}</p>
            <p className="text-[10px] text-slate-400 mt-0.5 font-bold uppercase tracking-wider">Sessions</p>
          </div>
        </>
      )}
    </div>
  );
}

function ClockIcon() { return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>); }
function TrendIcon() { return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 17 9 11 13 15 21 7" /><polyline points="14 7 21 7 21 14" /></svg>); }
function AlertIcon() { return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>); }
function ShieldIcon() { return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="9 15 11 17 15 13" /></svg>); }
