// Date / time helpers — UTC-first, with Manila (UTC+8) local helpers for day-keyed work.

export function nowUtc(): string {
  return new Date().toISOString();
}

export function addMinutesIso(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

// Combine a date (YYYY-MM-DD) + time-of-day (HH:MM[:SS]) into an ISO timestamp
// treating the input as Manila local (UTC+8). Result is in UTC ISO.
export function combineDateTime(dateStr: string, timeStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm, ss = 0] = timeStr.split(":").map(Number);
  // Manila is UTC+8, no DST. Subtract 8h to get UTC.
  const utcMillis = Date.UTC(y, (m ?? 1) - 1, d ?? 1, (hh ?? 0) - 8, mm ?? 0, ss ?? 0);
  return new Date(utcMillis).toISOString();
}

const MANILA_OFFSET_MIN = 8 * 60;

function manilaParts(d = new Date()): { y: number; m: number; day: number; dow: number } {
  const ms = d.getTime() + MANILA_OFFSET_MIN * 60_000;
  const x = new Date(ms);
  return {
    y: x.getUTCFullYear(),
    m: x.getUTCMonth() + 1,
    day: x.getUTCDate(),
    dow: x.getUTCDay(), // 0=Sun..6=Sat in Manila
  };
}

export function todayLocal(): string {
  const { y, m, day } = manilaParts();
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const DOW_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export type DowKey = (typeof DOW_KEYS)[number];

export function dayOfWeekKey(d: Date | string = new Date()): DowKey {
  const date = typeof d === "string" ? new Date(d) : d;
  const { dow } = manilaParts(date);
  return DOW_KEYS[dow];
}
