"use client";

import { useCallback, useEffect, useState } from "react";
import { useRealtimeChannel } from "./use-realtime-channel";

export type ActiveSession = {
  id: string;
  schedule_id: string;
  faculty_id: string;
  room_id: string;
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
  actual_start: string | null;
  actual_end: string | null;
  extension_status:
    | "none"
    | "pending"
    | "approved"
    | "denied"
    | "timed_out"
    | "auto_approved";
};

export function useActiveSession(_facultyId?: string | null) {
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/apis/sessions?scope=mine&active=1", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { sessions: ActiveSession[] };
      setSession(json.sessions?.[0] ?? null);
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

  useRealtimeChannel("sessions", () => {
    refresh();
  });

  return { session, loading, error, refresh };
}
