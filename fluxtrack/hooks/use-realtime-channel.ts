"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

type Table = "sessions" | "notifications" | "assist_requests" | "extension_requests" | "disputes";

type ChangePayload = { eventType: "INSERT" | "UPDATE" | "DELETE"; new: Record<string, unknown>; old: Record<string, unknown> };

type ChannelConfig = {
  name?: string;
  table: Table;
  event?: "*" | "INSERT" | "UPDATE" | "DELETE";
  filter?: string;
  onChange: (payload: ChangePayload) => void;
};

export function useRealtimeChannel(
  tableOrConfig: Table | ChannelConfig,
  onChangeArg?: (payload: ChangePayload) => void,
  filterArg?: string
) {
  const isConfig = typeof tableOrConfig === "object";
  const table = (isConfig ? tableOrConfig.table : tableOrConfig) as Table;
  const filter = isConfig ? tableOrConfig.filter : filterArg;
  const event = isConfig ? tableOrConfig.event ?? "*" : "*";
  const onChange = isConfig ? tableOrConfig.onChange : onChangeArg;
  const ref = useRef<((p: ChangePayload) => void) | undefined>(onChange);
  ref.current = onChange;

  useEffect(() => {
    // Defensive: if the Supabase env config is missing on the client (e.g.
    // dev server wasn't restarted after editing .env.local) skip the realtime
    // subscription rather than crashing the host component.
    let cleanup: (() => void) | null = null;
    try {
      const supabase = createClient();
      const channel = supabase.channel(`rt-${table}-${filter ?? "all"}`);
      channel.on(
        "postgres_changes" as never,
        { event, schema: "public", table, filter },
        (payload: unknown) => {
          const p = payload as ChangePayload;
          ref.current?.(p);
        }
      );
      channel.subscribe();
      cleanup = () => {
        try {
          supabase.removeChannel(channel);
        } catch {
          /* ignore */
        }
      };
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("[useRealtimeChannel] subscription skipped:", e);
    }
    return () => {
      cleanup?.();
    };
  }, [table, filter, event]);
}
