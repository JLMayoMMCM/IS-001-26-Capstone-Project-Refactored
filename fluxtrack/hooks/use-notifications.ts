"use client";

import { useCallback, useEffect, useState } from "react";
import { useRealtimeChannel } from "./use-realtime-channel";

export type Notification = {
  id: string;
  recipient_id: string;
  event_type: string;
  title: string;
  body: string;
  reference_id: string | null;
  reference_type: string | null;
  delivered_via: "push" | "in_app" | "both";
  read_at: string | null;
  created_at: string;
};

export function useNotifications(_opts?: { scope?: "all" | "mine"; realtime?: boolean }) {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/apis/notifications", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { items: Notification[] };
      setItems(json.items ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const markRead = useCallback(async (id: string) => {
    await fetch(`/apis/notifications/${id}/read`, { method: "POST" });
    setItems((prev) =>
      prev.map((n) => (n.id === id && !n.read_at ? { ...n, read_at: new Date().toISOString() } : n))
    );
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useRealtimeChannel("notifications", () => {
    refresh();
  });

  const unread = items.filter((i) => !i.read_at).length;

  return { items, unread, unreadCount: unread, loading, error, refresh, markRead };
}
