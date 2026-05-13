// Existing routes import from '@/types/database.types'. We provide a re-export
// of the canonical types defined in `@/lib/supabase/types` so both paths work.
export type { Database } from "@/lib/supabase/types";
export type {
  Role,
  Modality,
  DayOfWeek,
  SessionStatus,
  ExtensionStatus,
  EnRouteReason,
  EnRouteStatus,
  CheckerAction,
  CnaReason,
  GuardResolution,
  DisputeReason,
  DisputeStatus,
  DisputeSource,
  DisputeRemedialAction,
  BookingStatus,
  LockStage,
  ExportFormat,
  DeliveryVia,
  EmploymentType,
  RoomTypeEnum,
} from "@/lib/supabase/types";

import type { Database } from "@/lib/supabase/types";

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];

export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];

export type Json =
  | string
  | number
  | boolean
  | null
  | { [k: string]: Json }
  | Json[];
