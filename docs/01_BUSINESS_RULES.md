# FluxTrack — Business Rules by Role

> Rule IDs follow the pattern `BR-<ROLE>-<n>`. They are normative — every implementation phase in [`03_IMPLEMENTATION_PLAN.md`](03_IMPLEMENTATION_PLAN.md) must cite the BRs it satisfies.
> Where a rule encodes a concrete time/threshold, the value is the **default** — final values are configurable via the `system_settings` table introduced in the DB-modification migration.

---

## Cross-cutting rules (apply to every role)

| BR | Rule |
|---|---|
| BR-GEN-1 | All timestamps are stored in UTC (`timestamptz`); UI converts to Asia/Manila (UTC+8) for display. |
| BR-GEN-2 | Every state-changing action MUST emit an `audit_log` row with `actor_id`, `event_type`, and a JSON payload containing before/after values. |
| BR-GEN-3 | RLS is mandatory. Any new table must enable RLS and ship policies in `04_rls_policies.sql`. |
| BR-GEN-4 | Personally-identifying data (email, name) is visible only to: the user themselves, IFO admin, HR admin, system admin. |
| BR-GEN-5 | A user with `is_active = false` MAY NOT authenticate, MAY NOT receive notifications, and is excluded from all dashboards. |
| BR-GEN-6 | A user's `role` change MUST be recorded in `audit_log` and force an immediate sign-out of all active sessions for that user. |
| BR-GEN-7 | All file uploads (photos, exports) are stored in PRIVATE buckets; the client only sees signed URLs (60-second TTL). |
| BR-GEN-8 | Demo Mode (`NEXT_PUBLIC_DEMO_MODE=true`) bypasses BR-GEN-3/4 for browser reads ONLY on the four published realtime tables and ONLY when `auth.uid() IS NULL`. Demo Mode MUST be disabled in production. |
| BR-GEN-9 | A user MAY hold exactly one `role` at a time. Multi-role behavior is achieved by `system_admin` toggling roles in `admin-users`. |
| BR-GEN-10 | Session photos and HR exports follow a 30-day retention. Edge functions `photo-cleanup` / `export-cleanup` enforce purge. |

---

## Faculty (`faculty`)

### Schedule & Sessions

| BR | Rule |
|---|---|
| BR-FAC-1 | Faculty MAY only view sessions where `faculty_id = auth.uid()`. |
| BR-FAC-2 | A `session` is auto-materialized from a `schedule` at `T - 10 minutes` (scheduled start) with status `scheduled`. |
| BR-FAC-3 | Faculty MAY transition `scheduled → active` only inside the **check-in window** = `[scheduled_start - 10 min, scheduled_start + 15 min]`. |
| BR-FAC-4 | For `actual_modality ∈ { f2f, blended }`: check-in MUST include (a) a photo upload to `session-photos` AND (b) a WLAN check confirming on-campus IP (or `self_declared_on_campus=true` with a flag). |
| BR-FAC-5 | For `actual_modality = online`: check-in MUST include a Teams meeting link whose SHA-256 hash is stored in `teams_link_hash`. |
| BR-FAC-6 | If `actual_modality ≠ scheduled_modality`, `modality_override = true` and the session is flagged for HR review. |
| BR-FAC-7 | Late arrival window: between `start + 15` and `start + 30`, the faculty MUST file an `en_route_declaration` to keep the room reserved; otherwise the session is auto-marked `absent` at `start + 30`. |
| BR-FAC-8 | `en_route_declarations.eta_minutes ∈ [5, 60]`. The session goes to `en_route`. Hold expires at `declared_at + eta_minutes`. |
| BR-FAC-9 | If the en-route hold expires without check-in, status flips to `absent` and the room is released. |
| BR-FAC-10 | Faculty MAY end a session early (`scheduled_end - actual_end ≥ 15 min`) → status `early_end`, eligible for HR review. |
| BR-FAC-11 | Faculty MAY request a single `extension_request` per session, `1 ≤ requested_minutes ≤ 30`, only while session is `active`. |
| BR-FAC-12 | Extension auto-approves if no `incoming_session_id` exists in the same room within the requested window. Otherwise the incoming faculty has `response_deadline = requested_at + 5 minutes` to approve/deny; on timeout → `timed_out` (treated as denied). |
| BR-FAC-13 | If a session overruns `actual_end > scheduled_end + courtesy_window` (default `courtesy_window = 5 min`), status becomes `overstay` and IFO is notified. |
| BR-FAC-14 | Faculty MAY only check in on a device registered in `user_devices` for that user (matched by `mac_hint` or recent `last_seen_at`). |

### Disputes

| BR | Rule |
|---|---|
| BR-FAC-15 | Faculty MAY file a `dispute` against a session with `status ∈ { absent, early_end, checker_flagged, overstay }`. |
| BR-FAC-16 | Dispute window: 7 days from `session_date`. After that, `deadline_at` has passed and the API returns 409. |
| BR-FAC-17 | `disputes.explanation` MUST be ≥ 50 characters (DB CHECK). Evidence file (optional) goes to `session-photos` under a `disputes/` prefix. |
| BR-FAC-18 | A faculty MAY have at most one `pending` dispute per `session_id`. |

### Assists

| BR | Rule |
|---|---|
| BR-FAC-19 | Faculty MAY file an `assist_request` only for a session they own. `assist_types` is required (free-text comma list). |
| BR-FAC-20 | Filing an assist does NOT change session status. IFO + Guard on the room's floor receive a notification. |

### Profile

| BR | Rule |
|---|---|
| BR-FAC-21 | Faculty MAY update `full_name`, `department`, `push_subscription`, and CRUD their own `user_devices`. They MAY NOT change `role`, `faculty_id`, `email`, `employment_type`. |
| BR-FAC-22 | Exactly one device per user MAY be `is_primary = true` AND `is_active = true` (enforced by partial unique index). |
| BR-FAC-23 | Faculty MAY view a schedule's term span (`term_start_date..term_end_date`) and assigned `section`. Faculty MAY NOT edit any of those fields. |
| BR-FAC-24 | When IFO moves or archives a schedule that affects today/future sessions for a faculty, that faculty MUST receive an in-app + push notification with the old → new diff (event types `schedule.moved`, `schedule.archived`). |

---

## IFO Admin (`ifo_admin`)

### Live operations

| BR | Rule |
|---|---|
| BR-IFO-1 | IFO sees all rooms, all sessions, all schedules, all bookings, all disputes, all assists. |
| BR-IFO-2 | IFO dashboard polls `/apis/rooms/status` every **8 seconds**. (Switch to Realtime when D-11 lands.) |
| BR-IFO-3 | Room display status (derived) — `active` (session active or overstay or booked), `delayed` (en_route or pending), `no_show` (absent or checker_flagged), `available` (else). |
| BR-IFO-4 | IFO MAY **force-end** any session (`active → completed`). It MUST set `force_ended_by = auth.uid()` and `force_end_reason` (free-text, ≥ 20 chars). |
| BR-IFO-5 | IFO MAY acknowledge `assist_requests` by setting `ifo_acknowledged_by` + `ifo_acknowledged_at`. |
| BR-IFO-6 | An assist not acknowledged within **10 minutes** auto-emits an escalation notification to system_admin. |

### Bookings & Schedules

| BR | Rule |
|---|---|
| BR-IFO-7 | IFO MAY create/cancel `manual_bookings`. New booking MUST NOT overlap an existing active booking OR a `schedules` row for the same room/time. |
| BR-IFO-8 | IFO MAY import schedules via CSV at `/apis/schedules/import`. Each row MUST validate `faculty_id`, `room_id`, `course_code`, `day_of_week`, `start_time < end_time`, and `academic_term`. |
| BR-IFO-9 | A `schedule` MAY NOT be deleted if any non-`scheduled` session references it. Use `is_active = false` to retire it. |

### Disputes

| BR | Rule |
|---|---|
| BR-IFO-10 | IFO is the sole approver of disputes (system_admin can also approve). Approval transitions the underlying session per rule BR-IFO-11. |
| BR-IFO-11 | When a dispute is approved, IFO MUST pick a remedial action: (a) restore status to `completed` with HR-supplied actuals; (b) re-mark as `early_end`; (c) keep `absent` with a written explanation. Action is stored in `decision_note`. |
| BR-IFO-12 | Dispute SLA: IFO MUST respond within **48 hours** of `filed_at`; otherwise system_admin is paged. |

### Staff

| BR | Rule |
|---|---|
| BR-IFO-13 | IFO MAY view `checker_shifts` / `checker_shift_floors` for all users. IFO MAY create/assign new shifts. |
| BR-IFO-14 | A user MAY have at most one shift per `shift_date` (DB UNIQUE). |

### Class lifecycle — term duration, soft-remove, move, sections

> All rules below apply equally to `system_admin`. Faculty are read-only on this surface; HR reads historical archive only.

| BR | Rule |
|---|---|
| BR-IFO-15 | Every `schedule` MUST carry a **term span** (`term_start_date`, `term_end_date`) inside its `academic_term`. `term_end_date >= term_start_date`. Sessions auto-materialize only for `day_of_week` instances inside `[term_start_date, term_end_date]`, minus rows in `academic_breaks`. |
| BR-IFO-16 | IFO MAY shorten or extend a schedule's term span. Shortening MUST NOT remove dates that already have non-`scheduled` sessions; if a conflict exists, the API returns 409 with the conflicting dates listed. |
| BR-IFO-17 | **Soft remove** — IFO MAY archive a schedule by setting `is_active = false`, stamping `archived_at`, `archived_by`, `archive_reason` (≥ 20 chars). Archived schedules: (a) stop auto-materializing future sessions, (b) keep all historical sessions intact, (c) hidden from faculty dashboards but visible to IFO/HR with an "Archived" badge. |
| BR-IFO-18 | A schedule MAY NOT be hard-deleted while any `session` references it. Hard delete is reserved for `system_admin` and only when zero sessions reference the schedule. |
| BR-IFO-19 | Restoring an archived schedule (`is_active = false → true`) is allowed only if no overlapping active schedule has taken its `room_id × day_of_week × time-range` slot in the meantime. |
| BR-IFO-20 | **Move class** — IFO MAY change `room_id`, `day_of_week`, `start_time`, `end_time`, or `section_id` of a schedule using `/apis/schedules/[id]/move` with a required `effective_from` date. The move splits the schedule: original schedule's `term_end_date` is set to `effective_from - 1 day`; a new schedule row is created with the new fields and `term_start_date = effective_from`, linked via `replaced_by_schedule_id`. |
| BR-IFO-21 | A move MUST NOT introduce a room conflict (existing `schedules` or `manual_bookings`) and MUST NOT introduce a section conflict (BR-IFO-25) for any date in the new span. The pre-check is server-side. |
| BR-IFO-22 | A move SHALL emit notifications to the assigned `faculty_id` and to all faculty teaching the same `section_id` on the affected days. Future already-materialized `scheduled` sessions are re-pointed to the new schedule row on/after `effective_from`. |
| BR-IFO-23 | **Sections catalog** — IFO MAY CRUD `sections`. A `section` is uniquely identified by `(academic_term, section_code)`. Each section carries `program`, `year_level`, `student_count`, `is_active`. |
| BR-IFO-24 | A `schedule` MUST reference a `section_id` (existing free-text `schedules.section` column is migrated to a lookup; legacy nulls allowed during migration window). |
| BR-IFO-25 | **Section conflict (block available session)** — two active `schedules` MUST NOT overlap when they share `section_id` AND `day_of_week` AND any time-range overlap exists. The DB enforces this with an exclusion constraint scoped to `is_active = true`. |
| BR-IFO-26 | A `manual_booking` whose `room_id × time-range × date` collides with an active schedule's materialized session is rejected (this already follows from BR-IFO-7; restated here for completeness). |
| BR-IFO-27 | Academic breaks/holidays — IFO MAY define `academic_breaks (academic_term, date_from, date_to, label)`; sessions are NOT materialized for dates in any active break. |

---

## Checker (`checker`)

| BR | Rule |
|---|---|
| BR-CHK-1 | A checker MAY only act inside an `actual_start ≤ now() ≤ actual_end` window of their own `checker_shifts` row for today. |
| BR-CHK-2 | A checker sees sessions where `session_date = CURRENT_DATE` AND the room's `floor_number ∈ checker_floors_today()`. |
| BR-CHK-3 | Starting a shift (`/apis/checker/shifts/[id]/start`) sets `actual_start = now()` and is irreversible. |
| BR-CHK-4 | Ending a shift sets `actual_end` and locks new `checker_validations` inserts for that shift. |
| BR-CHK-5 | Each `checker_validations.action` MUST be one of `verified`, `flagged_absent`, `could_not_access`. `could_not_access` REQUIRES a non-null `cna_reason`. |
| BR-CHK-6 | A `verified` action on an `en_route` or `pending` session is rejected (HTTP 409). |
| BR-CHK-7 | `flagged_absent` transitions the session to `checker_flagged`. |
| BR-CHK-8 | A session MAY accrue multiple validations from multiple checkers; only the latest one drives session status. |
| BR-CHK-9 | Checker MAY copy their previous shift's floor assignment to a new shift via `/apis/checker/shifts/copy` ONLY when no shift exists for the target date. |
| BR-CHK-10 | Checker MAY view + acknowledge `assist_requests` whose room is on their assigned floor today (parity with guard). |

---

## Guard (`guard`)

| BR | Rule |
|---|---|
| BR-GRD-1 | Guard sees room/session rows only for rooms on their floor (`checker_floors_today()` reused for both roles via `checker_shifts.role = 'guard'`). |
| BR-GRD-2 | Guard MAY acknowledge an `assist_request` (sets `guard_acknowledged_by` + `guard_acknowledged_at`) and MUST log a `guard_resolution_status` + `guard_incident_note` within 30 minutes of ack. |
| BR-GRD-3 | A guard MAY NOT modify session status or schedule data; their writes are confined to `assist_requests`. |
| BR-GRD-4 | If guard resolution is `referred_external` or `referred_ifo`, an `escalated_at` is stamped automatically. |
| BR-GRD-5 | Guard receives push notifications (per `delivery_via`) for assist requests on their floor and for `overstay` events. |

---

## HR Admin (`hr_admin`)

### Records & Records-flagging

| BR | Rule |
|---|---|
| BR-HR-1 | HR MAY read every `session`, `schedule`, `dispute`, `payroll_period`, `hr_export`. |
| BR-HR-2 | HR MAY raise a system-side dispute by setting `dispute.source = 'hr_flag'` on a session; this REQUIRES `hr_flag_note` (≥ 20 chars) and stamps `hr_flagged_by`, `hr_flagged_at` on the session. |
| BR-HR-3 | HR MAY NOT directly mutate `sessions.status`. All corrections flow through a dispute. |
| BR-HR-4 | HR record listing MUST respect the active `payroll_periods.lock_stage`: soft-locked rows show a read-only badge; hard-locked rows are read-only. |
| BR-HR-4a | HR records MUST include rows from archived (soft-removed) schedules; the UI shows the schedule's `archived_at` and `archive_reason` for context. |
| BR-HR-4b | When a session was re-pointed by a move (`replaced_by_schedule_id` is present on its prior schedule), the HR detail view MUST show the move history (old → new room/time/section/effective_from). |

### Payroll periods

| BR | Rule |
|---|---|
| BR-HR-5 | A `payroll_period` progression: `none → soft → hard → archived`. No skipping; no regressing. |
| BR-HR-6 | A period MAY enter `soft` lock only when `open_disputes_count = 0`. `soft_lock_expires_at = soft_locked_at + 72 hours`. |
| BR-HR-7 | A period MAY enter `hard` lock only after `soft_lock_expires_at` has passed AND `open_disputes_count = 0`. |
| BR-HR-8 | `hard`-locked sessions: no UPDATEs allowed (enforced by trigger). |
| BR-HR-9 | `archived` is set automatically 90 days after `hard_locked_at`. Archived periods are exportable but otherwise frozen. |
| BR-HR-10 | Two payroll periods MAY NOT overlap `(date_from, date_to)`. |
| BR-HR-11 | Finalizing a period (`/apis/hr/payroll/[id]/finalize`) is the only allowed `soft → hard` transition. |

### Exports

| BR | Rule |
|---|---|
| BR-HR-12 | Exports MUST be filtered by either `payroll_period_id` OR an explicit `[date_from, date_to]` range. |
| BR-HR-13 | Every export MUST insert a row into `hr_exports` capturing `filter_criteria` JSON, `record_count`, `format`, `storage_path`. |
| BR-HR-14 | Exports are retained 30 days; `export-cleanup` purges expired rows + storage objects. |
| BR-HR-15 | Only HR + system_admin MAY read `hr_exports`. |

---

## System Admin (`system_admin`)

| BR | Rule |
|---|---|
| BR-SYS-1 | System admin MAY read every table including `audit_log` (only system_admin + hr_admin can `SELECT` audit_log). |
| BR-SYS-2 | System admin MAY change any user's `role` and `is_active`; the change MUST emit `audit_log` and force sign-out (BR-GEN-6). |
| BR-SYS-3 | System admin MAY NOT bypass `payroll_periods.lock_stage` invariants. (No backdoor edits to locked sessions.) |
| BR-SYS-4 | System admin MAY edit the `system_settings` table (introduced by the DB-modifications migration) that holds tunables: check-in window, late grace, courtesy window, dispute SLA, escalation thresholds. |
| BR-SYS-5 | System admin MAY trigger one-off runs of the daily cleanup edge functions and replay missed cron windows. |
| BR-SYS-6 | System admin sees the full `audit_log` UI with filters by `event_type`, `actor_id`, `target_type`. |

---

## Notification rules (applies to every role)

| BR | Rule |
|---|---|
| BR-NOT-1 | Every notification row carries `recipient_id`, `event_type`, `delivered_via`, and an idempotency-safe `reference_id` so duplicate pushes are filtered. |
| BR-NOT-2 | Push delivery uses `user_devices` rows where `is_active = true`. Failed VAPID send (410/404) MUST set the device `is_active = false`. |
| BR-NOT-3 | `delivered_via = 'in_app'` is mandatory; push is best-effort. The UI bell badge is driven by `notifications.read_at IS NULL`. |
| BR-NOT-4 | A user MAY mute notifications by category via `users.push_subscription` JSON preferences (settings page). Mute applies to push only; in-app is always logged. |

---

## Compliance & audit triggers (selected events)

These events MUST be written to `audit_log`:

- `session.start`, `session.end`, `session.force_end`, `session.absent_auto`, `session.overstay_auto`
- `extension.requested`, `extension.approved`, `extension.denied`, `extension.timed_out`
- `dispute.filed`, `dispute.approved`, `dispute.denied`, `dispute.hr_flagged`
- `payroll.soft_lock`, `payroll.hard_lock`, `payroll.archive`, `payroll.finalize`
- `user.role_changed`, `user.deactivated`, `user.activated`
- `hr.export_created`, `hr.export_downloaded`
- `assist.filed`, `assist.acknowledged_ifo`, `assist.acknowledged_guard`, `assist.escalated`
- `schedule.created`, `schedule.updated`, `schedule.archived`, `schedule.restored`, `schedule.moved`, `schedule.hard_deleted`
- `section.created`, `section.updated`, `section.deactivated`
- `academic_break.created`, `academic_break.updated`, `academic_break.deleted`
