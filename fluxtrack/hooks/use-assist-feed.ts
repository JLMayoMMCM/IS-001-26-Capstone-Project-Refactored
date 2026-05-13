"use client";

import { useCallback, useEffect, useState } from "react";
import { useRealtimeChannel } from "./use-realtime-channel";

export type AssistRequest = {
  id: string;
  faculty_id: string;
  room_id: string;
  session_id: string | null;
  assist_types: string;
  note: string | null;
  sent_at: string;
  ifo_acknowledged_at: string | null;
  guard_acknowledged_at: string | null;
  guard_resolution_status:
    | "resolved_onsite"
    | "referred_ifo"
    | "referred_external"
    | "no_issue"
    | "other"
    | null;
  guard_incident_logged_at: string | null;
  guard_incident_note: string | null;
  escalated_at: string | null;
  room?: { room_code: string; floor_number: number; building: string };
  faculty?: { full_name: string };
};

export function useAssistFeed(scope: "all" | "mine" | "floor" = "all") {
  const [items, setItems] = useState<AssistRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/apis/assists?scope=${scope}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { items: AssistRequest[] };
      setItems(json.items ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useRealtimeChannel("assist_requests", () => {
    refresh();
  });

  return { items, loading, error, refresh };
}
