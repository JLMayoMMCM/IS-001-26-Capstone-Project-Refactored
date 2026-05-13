// Hand-written Database type for FluxTrack. Mirrors:
//   replication/sql/02_schema_postgres.sql
//   replication/sql/07_user_devices.sql
//   replication/sql/09_business_rules_migration.sql
//
// Row types are declared as top-level aliases first, then composed into the
// Database structure. This avoids the self-referential
// `Database["public"]["Tables"][X]["Row"]` pattern that breaks TS inference
// for `supabase.from(...).insert(...)`.

export type Role =
  | "faculty"
  | "ifo_admin"
  | "checker"
  | "guard"
  | "hr_admin"
  | "system_admin";

export type Modality = "f2f" | "blended" | "online";

export type DayOfWeek = "mon" | "tue" | "wed" | "thu" | "fri" | "sat";

export type SessionStatus =
  | "scheduled"
  | "pending"
  | "active"
  | "en_route"
  | "completed"
  | "early_end"
  | "absent"
  | "overstay"
  | "checker_flagged";

export type ExtensionStatus =
  | "none"
  | "pending"
  | "approved"
  | "denied"
  | "timed_out"
  | "auto_approved";

export type EnRouteReason = "current_class" | "traffic" | "commute" | "other";
export type EnRouteStatus = "active" | "expired" | "cancelled" | "resolved";
export type CheckerAction = "verified" | "flagged_absent" | "could_not_access";
export type CnaReason =
  | "room_locked"
  | "restricted_access"
  | "room_not_found"
  | "other";
export type GuardResolution =
  | "resolved_onsite"
  | "referred_ifo"
  | "referred_external"
  | "no_issue"
  | "other";
export type DisputeReason =
  | "wlan_issue"
  | "camera_issue"
  | "schedule_error"
  | "checker_error"
  | "other";
export type DisputeStatus = "pending" | "approved" | "denied" | "escalated";
export type DisputeSource = "faculty" | "hr_flag";
export type DisputeRemedialAction =
  | "restore_completed"
  | "mark_early_end"
  | "keep_status"
  | "manual_adjust";
export type BookingStatus = "active" | "cancelled";
export type LockStage = "none" | "soft" | "hard" | "archived";
export type ExportFormat = "csv" | "pdf";
export type DeliveryVia = "push" | "in_app" | "both";
export type EmploymentType = "full_time" | "part_time";
export type RoomTypeEnum = "lecture" | "lab" | "seminar" | "conference" | "other";

// ─── Row aliases ────────────────────────────────────────────────────────────

export type UsersRow = {
  id: string;
  entra_id: string;
  email: string;
  full_name: string;
  role: Role;
  faculty_id: string | null;
  department: string | null;
  employment_type: EmploymentType | null;
  is_active: boolean;
  push_subscription: unknown | null;
  created_at: string;
  last_login: string | null;
  signout_after: string | null;
};
export type UsersInsert = Partial<UsersRow> & {
  id: string;
  entra_id: string;
  email: string;
  full_name: string;
  role: Role;
};
export type UsersUpdate = Partial<UsersRow>;

export type RoomsRow = {
  id: string;
  room_code: string;
  building: string;
  floor_number: number;
  room_type: RoomTypeEnum;
  capacity: number | null;
  is_active: boolean;
};
export type RoomsInsert = Partial<RoomsRow> & {
  room_code: string;
  building: string;
  floor_number: number;
  room_type: RoomTypeEnum;
};
export type RoomsUpdate = Partial<RoomsRow>;

export type SchedulesRow = {
  id: string;
  faculty_id: string;
  room_id: string;
  course_code: string;
  course_name: string;
  section: string | null;
  enrolled_count: number;
  scheduled_modality: Modality;
  day_of_week: DayOfWeek;
  start_time: string;
  end_time: string;
  academic_term: string;
  is_active: boolean;
  term_start_date: string | null;
  term_end_date: string | null;
  section_id: string | null;
  archived_at: string | null;
  archived_by: string | null;
  archive_reason: string | null;
  replaced_by_schedule_id: string | null;
  replaces_schedule_id: string | null;
};
export type SchedulesInsert = Partial<SchedulesRow> & {
  faculty_id: string;
  room_id: string;
  course_code: string;
  course_name: string;
  scheduled_modality: Modality;
  day_of_week: DayOfWeek;
  start_time: string;
  end_time: string;
  academic_term: string;
};
export type SchedulesUpdate = Partial<SchedulesRow>;

export type SessionsRow = {
  id: string;
  schedule_id: string;
  faculty_id: string;
  room_id: string;
  session_date: string;
  status: SessionStatus;
  actual_modality: Modality | null;
  modality_override: boolean;
  wlan_on_campus: boolean | null;
  self_declared_on_campus: boolean;
  photo_storage_path: string | null;
  photo_submitted: boolean;
  photo_submitted_at: string | null;
  teams_link_hash: string | null;
  actual_start: string | null;
  actual_end: string | null;
  duration_minutes: number | null;
  extension_window_closes_at: string | null;
  extension_status: ExtensionStatus;
  courtesy_window_start: string | null;
  overstay_flagged_at: string | null;
  payroll_period_id: string | null;
  hr_flag_note: string | null;
  hr_flagged_by: string | null;
  hr_flagged_at: string | null;
  force_ended_by: string | null;
  force_end_reason: string | null;
  created_at: string;
  updated_at: string;
};
export type SessionsInsert = Partial<SessionsRow> & {
  schedule_id: string;
  faculty_id: string;
  room_id: string;
  session_date: string;
};
export type SessionsUpdate = Partial<SessionsRow>;

export type EnRouteDeclarationsRow = {
  id: string;
  faculty_id: string;
  session_id: string;
  eta_minutes: number;
  reason: EnRouteReason;
  hold_expires_at: string;
  declared_at: string;
  cancelled_at: string | null;
  cancel_reason: string | null;
  warning_sent: boolean;
  status: EnRouteStatus;
};
export type EnRouteDeclarationsInsert = Partial<EnRouteDeclarationsRow> & {
  faculty_id: string;
  session_id: string;
  eta_minutes: number;
  reason: EnRouteReason;
  hold_expires_at: string;
  declared_at: string;
};
export type EnRouteDeclarationsUpdate = Partial<EnRouteDeclarationsRow>;

export type ExtensionRequestsRow = {
  id: string;
  requesting_session_id: string;
  incoming_session_id: string | null;
  requested_minutes: number;
  status: ExtensionStatus;
  requested_at: string;
  response_deadline: string | null;
  responded_at: string | null;
  responded_by: string | null;
};
export type ExtensionRequestsInsert = Partial<ExtensionRequestsRow> & {
  requesting_session_id: string;
  requested_minutes: number;
  requested_at: string;
};
export type ExtensionRequestsUpdate = Partial<ExtensionRequestsRow>;

export type AssistRequestsRow = {
  id: string;
  faculty_id: string;
  room_id: string;
  session_id: string | null;
  assist_types: string;
  note: string | null;
  sent_at: string;
  ifo_acknowledged_by: string | null;
  ifo_acknowledged_at: string | null;
  guard_acknowledged_by: string | null;
  guard_acknowledged_at: string | null;
  guard_incident_note: string | null;
  guard_resolution_status: GuardResolution | null;
  guard_incident_logged_at: string | null;
  escalated_at: string | null;
};
export type AssistRequestsInsert = Partial<AssistRequestsRow> & {
  faculty_id: string;
  room_id: string;
  assist_types: string;
  sent_at: string;
};
export type AssistRequestsUpdate = Partial<AssistRequestsRow>;

export type DisputesRow = {
  id: string;
  session_id: string;
  faculty_id: string;
  reason_category: DisputeReason;
  explanation: string;
  evidence_storage_path: string | null;
  filed_at: string;
  deadline_at: string;
  status: DisputeStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  decision_note: string | null;
  source: DisputeSource;
  remedial_action: DisputeRemedialAction | null;
};
export type DisputesInsert = Partial<DisputesRow> & {
  session_id: string;
  faculty_id: string;
  reason_category: DisputeReason;
  explanation: string;
  filed_at: string;
  deadline_at: string;
};
export type DisputesUpdate = Partial<DisputesRow>;

export type ManualBookingsRow = {
  id: string;
  room_id: string;
  booked_by: string;
  occupant_name: string;
  purpose: string | null;
  start_datetime: string;
  end_datetime: string;
  contact_info: string | null;
  status: BookingStatus;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  created_at: string;
};
export type ManualBookingsInsert = Partial<ManualBookingsRow> & {
  room_id: string;
  booked_by: string;
  occupant_name: string;
  start_datetime: string;
  end_datetime: string;
};
export type ManualBookingsUpdate = Partial<ManualBookingsRow>;

export type PayrollPeriodsRow = {
  id: string;
  name: string;
  date_from: string;
  date_to: string;
  lock_stage: LockStage;
  soft_locked_at: string | null;
  soft_lock_expires_at: string | null;
  hard_locked_at: string | null;
  archived_at: string | null;
  created_by: string;
  finalized_by: string | null;
  record_count: number;
  open_disputes_count: number;
};
export type PayrollPeriodsInsert = Partial<PayrollPeriodsRow> & {
  name: string;
  date_from: string;
  date_to: string;
  created_by: string;
};
export type PayrollPeriodsUpdate = Partial<PayrollPeriodsRow>;

export type HrExportsRow = {
  id: string;
  exported_by: string;
  payroll_period_id: string | null;
  date_from: string;
  date_to: string;
  format: ExportFormat;
  record_count: number;
  storage_path: string | null;
  exported_at: string;
  filter_criteria: unknown | null;
};
export type HrExportsInsert = Partial<HrExportsRow> & {
  exported_by: string;
  date_from: string;
  date_to: string;
  format: ExportFormat;
  record_count: number;
  exported_at: string;
};
export type HrExportsUpdate = Partial<HrExportsRow>;

export type CheckerShiftsRow = {
  id: string;
  user_id: string;
  role: "checker" | "guard";
  shift_date: string;
  scheduled_start: string;
  scheduled_end: string;
  actual_start: string | null;
  actual_end: string | null;
  assigned_by: string;
  rooms_validated: number;
  rooms_skipped: number;
  note: string | null;
};
export type CheckerShiftsInsert = Partial<CheckerShiftsRow> & {
  user_id: string;
  role: "checker" | "guard";
  shift_date: string;
  scheduled_start: string;
  scheduled_end: string;
  assigned_by: string;
};
export type CheckerShiftsUpdate = Partial<CheckerShiftsRow>;

export type CheckerShiftFloorsRow = {
  id: string;
  shift_id: string;
  floor_number: number;
  building: string | null;
};
export type CheckerShiftFloorsInsert = Partial<CheckerShiftFloorsRow> & {
  shift_id: string;
  floor_number: number;
};
export type CheckerShiftFloorsUpdate = Partial<CheckerShiftFloorsRow>;

export type CheckerValidationsRow = {
  id: string;
  session_id: string;
  checker_id: string;
  action: CheckerAction;
  note: string | null;
  cna_reason: CnaReason | null;
  validated_at: string;
  shift_id: string;
};
export type CheckerValidationsInsert = Partial<CheckerValidationsRow> & {
  session_id: string;
  checker_id: string;
  action: CheckerAction;
  validated_at: string;
  shift_id: string;
};
export type CheckerValidationsUpdate = Partial<CheckerValidationsRow>;

export type NotificationsRow = {
  id: string;
  recipient_id: string;
  event_type: string;
  title: string;
  body: string;
  reference_id: string | null;
  reference_type: string | null;
  delivered_via: DeliveryVia;
  read_at: string | null;
  created_at: string;
};
export type NotificationsInsert = Partial<NotificationsRow> & {
  recipient_id: string;
  event_type: string;
  title: string;
  body: string;
  delivered_via: DeliveryVia;
};
export type NotificationsUpdate = Partial<NotificationsRow>;

export type AuditLogRow = {
  id: string;
  event_type: string;
  actor_id: string | null;
  target_type: string | null;
  target_id: string | null;
  payload: unknown | null;
  ip_address: string | null;
  created_at: string;
};
export type AuditLogInsert = Partial<AuditLogRow> & { event_type: string };

export type UserDevicesRow = {
  id: string;
  user_id: string;
  name: string;
  mac_hint: string | null;
  device_type: "laptop" | "tablet" | "phone" | "desktop" | "other";
  is_primary: boolean;
  is_active: boolean;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
};
export type UserDevicesInsert = Partial<UserDevicesRow> & {
  user_id: string;
  name: string;
};
export type UserDevicesUpdate = Partial<UserDevicesRow>;

export type SectionsRow = {
  id: string;
  academic_term_id: string;
  section_code: string;
  program: string | null;
  year_level: number | null;
  student_count: number;
  is_active: boolean;
  created_at: string;
  created_by: string | null;
};
export type SectionsInsert = Partial<SectionsRow> & {
  academic_term_id: string;
  section_code: string;
};
export type SectionsUpdate = Partial<SectionsRow>;

export type AcademicTermsRow = {
  id: string;
  code: string;
  name: string;
  term_start_date: string;
  term_end_date: string;
  is_active: boolean;
  created_at: string;
};
export type AcademicTermsInsert = Partial<AcademicTermsRow> & {
  code: string;
  name: string;
  term_start_date: string;
  term_end_date: string;
};
export type AcademicTermsUpdate = Partial<AcademicTermsRow>;

export type AcademicBreaksRow = {
  id: string;
  term_id: string;
  date_from: string;
  date_to: string;
  label: string;
  is_active: boolean;
};
export type AcademicBreaksInsert = Partial<AcademicBreaksRow> & {
  term_id: string;
  date_from: string;
  date_to: string;
  label: string;
};
export type AcademicBreaksUpdate = Partial<AcademicBreaksRow>;

export type ScheduleMovesRow = {
  id: string;
  original_schedule_id: string;
  new_schedule_id: string;
  effective_from: string;
  moved_by: string;
  moved_at: string;
  diff: unknown;
  sessions_repointed: number;
};
export type ScheduleMovesInsert = Partial<ScheduleMovesRow> & {
  original_schedule_id: string;
  new_schedule_id: string;
  effective_from: string;
  moved_by: string;
  diff: unknown;
};

export type SystemSettingsRow = {
  key: string;
  value: unknown;
  value_type: "integer" | "boolean" | "string" | "minutes" | "hours" | "enum";
  description: string | null;
  updated_at: string;
  updated_by: string | null;
};
export type SystemSettingsInsert = Partial<SystemSettingsRow> & {
  key: string;
  value: unknown;
  value_type: SystemSettingsRow["value_type"];
};
export type SystemSettingsUpdate = Partial<SystemSettingsRow>;

export type NotificationPreferencesRow = {
  user_id: string;
  event_type: string;
  push_enabled: boolean;
  in_app_enabled: boolean;
  updated_at: string;
};
export type NotificationPreferencesInsert = Partial<NotificationPreferencesRow> & {
  user_id: string;
  event_type: string;
};
export type NotificationPreferencesUpdate = Partial<NotificationPreferencesRow>;

export type RoomHandoverConflictsRow = {
  id: string;
  requesting_session_id: string;
  incoming_session_id: string;
  incoming_faculty_id: string;
  tapped_at: string;
  protection_expires_at: string;
  ifo_notified_at: string;
  resolved_at: string | null;
};

// ─── Composed Database type ─────────────────────────────────────────────────

// Supabase's GenericTable requires `Relationships: GenericRelationship[]`. We
// supply an empty Relationships tuple on each table so the Schema satisfies
// GenericSchema and `from()` is properly typed.
type Rel = {
  foreignKeyName: string;
  columns: string[];
  isOneToOne?: boolean;
  referencedRelation: string;
  referencedColumns: string[];
}[];
type T<R, I, U> = { Row: R; Insert: I; Update: U; Relationships: Rel };

export type Database = {
  public: {
    Tables: {
      users:                    T<UsersRow,                    UsersInsert,                    UsersUpdate>;
      rooms:                    T<RoomsRow,                    RoomsInsert,                    RoomsUpdate>;
      schedules:                T<SchedulesRow,                SchedulesInsert,                SchedulesUpdate>;
      sessions:                 T<SessionsRow,                 SessionsInsert,                 SessionsUpdate>;
      en_route_declarations:    T<EnRouteDeclarationsRow,      EnRouteDeclarationsInsert,      EnRouteDeclarationsUpdate>;
      extension_requests:       T<ExtensionRequestsRow,        ExtensionRequestsInsert,        ExtensionRequestsUpdate>;
      assist_requests:          T<AssistRequestsRow,           AssistRequestsInsert,           AssistRequestsUpdate>;
      disputes:                 T<DisputesRow,                 DisputesInsert,                 DisputesUpdate>;
      manual_bookings:          T<ManualBookingsRow,           ManualBookingsInsert,           ManualBookingsUpdate>;
      payroll_periods:          T<PayrollPeriodsRow,           PayrollPeriodsInsert,           PayrollPeriodsUpdate>;
      hr_exports:               T<HrExportsRow,                HrExportsInsert,                HrExportsUpdate>;
      checker_shifts:           T<CheckerShiftsRow,            CheckerShiftsInsert,            CheckerShiftsUpdate>;
      checker_shift_floors:     T<CheckerShiftFloorsRow,       CheckerShiftFloorsInsert,       CheckerShiftFloorsUpdate>;
      checker_validations:      T<CheckerValidationsRow,       CheckerValidationsInsert,       CheckerValidationsUpdate>;
      notifications:            T<NotificationsRow,            NotificationsInsert,            NotificationsUpdate>;
      audit_log:                T<AuditLogRow,                 AuditLogInsert,                 Partial<AuditLogRow>>;
      user_devices:             T<UserDevicesRow,              UserDevicesInsert,              UserDevicesUpdate>;
      sections:                 T<SectionsRow,                 SectionsInsert,                 SectionsUpdate>;
      academic_terms:           T<AcademicTermsRow,            AcademicTermsInsert,            AcademicTermsUpdate>;
      academic_breaks:          T<AcademicBreaksRow,           AcademicBreaksInsert,           AcademicBreaksUpdate>;
      schedule_moves:           T<ScheduleMovesRow,            ScheduleMovesInsert,            Partial<ScheduleMovesRow>>;
      system_settings:          T<SystemSettingsRow,           SystemSettingsInsert,           SystemSettingsUpdate>;
      notification_preferences: T<NotificationPreferencesRow,  NotificationPreferencesInsert,  NotificationPreferencesUpdate>;
      room_handover_conflicts:  T<RoomHandoverConflictsRow,    Partial<RoomHandoverConflictsRow>, Partial<RoomHandoverConflictsRow>>;
    };
    Views: Record<string, never>;
    Functions: {
      fn_move_schedule: {
        Args: {
          p_schedule_id: string;
          p_effective_from: string;
          p_new: Record<string, unknown>;
          p_actor: string;
        };
        Returns: string;
      };
      fn_materialize_sessions: {
        Args: { p_horizon_days?: number };
        Returns: number;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
