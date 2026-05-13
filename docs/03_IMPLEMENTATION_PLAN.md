# FluxTrack — Phased Implementation Plan

> One role per phase. Phase 0 lays the cross-cutting database / settings substrate that every later phase depends on. Each role-phase ends with a verification checklist tied to its BRs.
> Phases are sequential by default; intra-phase tasks may parallelize.

Conventions:
- `[DB]` task = schema work (SQL migration).
- `[API]` task = Next.js route handler.
- `[UI]` task = page/component work.
- `[OPS]` task = cron / edge function / settings.
- `[QA]` task = test or verification step.

---

## Phase 0 — Foundation (cross-cutting; NO role-specific UI)

Goal: ship the schema changes, settings table, audit triggers, and notification helper that every later phase consumes.

- [DB] Apply migration `09_business_rules_migration.sql` (see [`04_DB_MODIFICATIONS.md`](04_DB_MODIFICATIONS.md)).
- [DB] Seed default `system_settings` rows (check-in window, courtesy window, dispute SLA, escalation thresholds).
- [DB] Install audit trigger function `tg_emit_audit(event_type)` applied to: `sessions`, `disputes`, `payroll_periods`, `users` (role/active fields), `hr_exports`, `assist_requests`, `extension_requests`.
- [DB] Install payroll-lock enforcement trigger on `sessions` (rejects UPDATE when parent period `lock_stage = 'hard'`).
- [DB] Install partial unique index ensuring at most one `pending` dispute per `session_id`.
- [OPS] Wire the 8 pg_cron monitors listed in SRS Part 8 (en-route expiry, absence detector, overstay, extension timeout, soft-lock expiry, archive sweep, assist escalation, handover-protection expiry).
- [OPS] Implement `push-send` Edge Function (consumes from `notifications` queue, fans out via `user_devices`, BR-NOT-2).
- [QA] Verify `select * from cron.job;` ≥ 10 entries.
- [QA] Verify role-change forces sign-out (BR-GEN-6).

Exit criteria: every BR in §"Cross-cutting" and §"Notification rules" of [`01_BUSINESS_RULES.md`](01_BUSINESS_RULES.md) is enforced at the DB layer; UI work that follows just has to call existing endpoints.

---

## Phase 1 — Faculty role

BR coverage: BR-FAC-1..22, BR-NOT-3..4.

### Backend
- [API] Tighten `apis/sessions/[id]/start` to enforce BR-FAC-3 (window), BR-FAC-4 (photo + WLAN), BR-FAC-5 (Teams hash), BR-FAC-6 (modality override flag), BR-FAC-14 (device must exist).
- [API] `apis/sessions/[id]/en-route` enforce eta range + reason enum (BR-FAC-8).
- [API] `apis/sessions/[id]/extension` enforce one-per-session + 30-min cap; auto-approve when no incoming class (BR-FAC-12).
- [API] `apis/disputes` enforce window (BR-FAC-16), single-pending unique (BR-FAC-18), evidence path under `disputes/`.
- [API] `apis/users/me` block role/email/employment_type updates (BR-FAC-21).

### Frontend
- [UI] Faculty dashboard: live status card; toast on auto-`absent`; "Declare en-route" modal.
- [UI] Check-in flow: photo capture → WLAN check → modality picker → confirm; Teams-link prompt branch for `online`.
- [UI] Schedule grid: filter by term; click → session detail.
- [UI] Attendance: 30-day window; status badges; "File dispute" button (only when eligible per BR-FAC-15).
- [UI] Profile: device CRUD; primary-device guard (BR-FAC-22).
- [UI] Preferences: per-event mute toggles (BR-NOT-4).

### QA
- [QA] End-to-end: scheduled → active → completed happy path.
- [QA] Late-arrival: en-route → expired → auto-absent.
- [QA] Extension: incoming-class denial path + timeout path.
- [QA] Dispute lifecycle: file → approve → session reflects new status.

---

## Phase 2 — IFO Admin role

BR coverage: BR-IFO-1..27, BR-FAC-23..24, BR-HR-4a..4b.

### Backend
- [API] `apis/rooms/status` — confirm derivation matches BR-IFO-3; emit 304 when nothing changed for ETag-style polling efficiency.
- [API] `apis/sessions/[id]` (PATCH force-end) — require `force_end_reason ≥ 20 chars` (BR-IFO-4).
- [API] `apis/bookings` — server-side conflict check (BR-IFO-7).
- [API] `apis/schedules/import` — row-level validation report; partial commit OK with summary.
- [API] `apis/disputes/[id]/approve` — require remedial-action enum + decision_note (BR-IFO-11).
- [API] `apis/audit` (NEW) — paginated audit reader (role-gated to ifo/system_admin).
- [API] `apis/schedules` POST/PATCH — require `term_start_date`, `term_end_date`, `section_id`; validate span ⊆ academic_term span (BR-IFO-15..16).
- [API] `apis/schedules/[id]/archive` POST — soft-remove with `archive_reason ≥ 20`; PATCH or `?restore=1` to restore (BR-IFO-17..19).
- [API] `apis/schedules/[id]/move` POST — split-schedule wizard endpoint; payload `{ effective_from, room_id?, day_of_week?, start_time?, end_time?, section_id? }`; runs conflict pre-check, splits term, re-points future `scheduled` sessions, writes `schedule_moves` row, fans out notifications (BR-IFO-20..22).
- [API] `apis/sections` CRUD + `[id]/conflicts` (BR-IFO-23..25).
- [API] `apis/academic-terms` CRUD; `apis/academic-breaks` CRUD (BR-IFO-27).
- [OPS] Cron: nightly materializer — for every active schedule, create missing `sessions` rows for `[today, today + 14 days] ∩ [term_start_date, term_end_date] − academic_breaks`. Replaces ad-hoc T−10min creation.
- [OPS] Cron: dispute SLA timer (48h → notify system_admin per BR-IFO-12).
- [OPS] Cron: assist escalation timer (10 min → notify system_admin per BR-IFO-6).

### Frontend
- [UI] Dashboard polling already done; add room-detail force-end modal w/ 20-char reason validator.
- [UI] Schedule importer: drop CSV → preview table with row-level errors → commit.
- [UI] Bookings: month view; conflict diff modal.
- [UI] Disputes: split queue (pending/approved/denied) + remedial action picker.
- [UI] Staff: shift assignment with floor multi-select.
- [UI] `/ifo/ifo-assists` (NEW): live feed; ack button; "escalate now" override.
- [UI] `/ifo/ifo-audit` (NEW): table with filters (event_type, actor, target_type, date range).
- [UI] Schedule page: add term-span editor (`term_start_date`, `term_end_date`); show derived "N weeks, ~M sessions" preview; warn on shorten conflicts.
- [UI] Schedule page: "Archived" tab; archive drawer (reason ≥ 20); Restore CTA with BR-IFO-19 guard.
- [UI] Schedule page: "Move class" wizard (4-step modal: when → what → conflict report → confirm); shows notification recipient list before commit.
- [UI] `/ifo/ifo-sections` (NEW): list, create, deactivate sections; per-section schedule timeline.
- [UI] `/ifo/ifo-academic-calendar` (NEW): term + breaks CRUD; visual term-strip calendar.

### QA
- [QA] Force-end without reason returns 422.
- [QA] CSV import: bad row reports correct line number.
- [QA] Dispute approval emits audit row.
- [QA] Audit log viewer paginates server-side.
- [QA] Schedule with `term_end_date < term_start_date` is rejected (DB CHECK).
- [QA] Archive of a schedule with existing future `scheduled` sessions soft-removes the schedule AND those future sessions; historical (non-`scheduled`) sessions remain intact.
- [QA] Restore is blocked when the slot has been reclaimed by another active schedule.
- [QA] Move wizard pre-check returns the exact conflicting schedule IDs.
- [QA] After commit, future `scheduled` sessions point at the new schedule row; past sessions still point at the original.
- [QA] Two active schedules sharing `section_id`, `day_of_week`, and overlapping times are rejected by the section-exclusion constraint.
- [QA] Nightly materializer skips dates inside active `academic_breaks` rows.

---

## Phase 3 — Checker role

BR coverage: BR-CHK-1..10.

### Backend
- [API] `apis/checker/validations` — enforce shift-active window (BR-CHK-1), action/cna_reason combos (BR-CHK-5), reject verify on en_route/pending (BR-CHK-6), increment shift counters.
- [API] `apis/checker/shifts/[id]/start` — set actual_start; reject if shift_date ≠ today.
- [API] `apis/checker/shifts/[id]/end` — irreversibly set actual_end; block subsequent validation inserts.
- [API] `apis/checker/shifts/copy` — only when target date has no shift for this user.

### Frontend
- [UI] Dashboard tiles: today's KPIs (rooms validated / skipped / no-access reasons).
- [UI] Checklist: floor-grouped rooms; one-tap Verify / Flag / CNA with reason picker.
- [UI] Shift history: previous shifts table; "Copy to today" CTA.
- [UI] Offline queue (optional, behind a flag): localStorage queue → replay on reconnect.
- [UI] Assists list (read + ack) filtered to today's floors.

### QA
- [QA] Verify outside shift window returns 409.
- [QA] CNA without reason returns 422.
- [QA] Copy when target day already has a shift returns 409.

---

## Phase 4 — Guard role

BR coverage: BR-GRD-1..5.

### Backend
- [API] `apis/assists/[id]/acknowledge` — guard branch enforces 30-min follow-up window; auto-set `escalated_at` if resolution ∈ {`referred_*`}.
- [OPS] Cron: scan acknowledged-but-no-resolution assists past 30 min → push reminder.

### Frontend
- [UI] Dashboard: floor room mini-map + live assist feed cards.
- [UI] Assist card: resolution chip-bar (5 enum buttons) + note field (mandatory on ack-completion).
- [UI] `/guard/guard-incidents` (NEW): table of past resolutions; date/floor filter.
- [UI] Push subscription prompt on first visit.

### QA
- [QA] Guard cannot edit `sessions` (RLS denies).
- [QA] Resolution `referred_external` stamps `escalated_at`.

---

## Phase 5 — HR Admin role

BR coverage: BR-HR-1..15, BR-FAC-15 (server side of HR-flag).

### Backend
- [API] `apis/hr/disputes/flag` (NEW) — create dispute w/ `source = 'hr_flag'`; stamp `hr_flagged_*` on session; enforce `hr_flag_note ≥ 20` (BR-HR-2).
- [API] `apis/hr/payroll` POST — reject overlapping date ranges (BR-HR-10).
- [API] `apis/hr/payroll/[id]` PATCH — only `none → soft` allowed here; gate on `open_disputes_count = 0` (BR-HR-6).
- [API] `apis/hr/payroll/[id]/finalize` — only `soft → hard` after `soft_lock_expires_at < now()` and `open_disputes_count = 0` (BR-HR-7, BR-HR-11).
- [API] `apis/hr/exports` — must reference period OR explicit range; record `filter_criteria` (BR-HR-12..13).
- [DB] Trigger: maintain `payroll_periods.open_disputes_count` automatically.
- [OPS] Cron: auto-archive 90 days post hard-lock (BR-HR-9).

### Frontend
- [UI] Dashboard KPIs with date-range scope.
- [UI] Records: server-side pagination; per-row lock badge.
- [UI] Payroll: stage progression visual (`none → soft → hard → archived`).
- [UI] Exports: filter chips + format toggle (CSV/PDF) + history with download via signed URL.
- [UI] `/hr/hr-disputes` (NEW): pick a session row → open HR-flag dispute.

### QA
- [QA] Cannot soft-lock with open disputes.
- [QA] Cannot hard-lock before soft expiry.
- [QA] Export download issues 60-s signed URL.
- [QA] Hard-locked sessions reject UPDATE in psql.

---

## Phase 6 — System Admin role

BR coverage: BR-SYS-1..6.

### Backend
- [API] `apis/admin/settings` GET/PATCH (NEW) — backed by `system_settings`; PATCH validates key + type.
- [API] `apis/admin/audit` GET (NEW) — paginated, filter-able, role-gated.
- [API] `apis/admin/jobs/run` POST (NEW) — invoke a cron job ad-hoc by name.
- [API] `apis/users/[id]` PATCH — on role change: stamp audit + invalidate sessions (BR-GEN-6, BR-SYS-2).

### Frontend
- [UI] `/admin/admin-settings` (NEW): typed form per setting (numbers, booleans, enums).
- [UI] `/admin/admin-audit` (NEW): table w/ filters; CSV export.
- [UI] `/admin/admin-jobs` (NEW): list cron jobs (`cron.job` view); last run / next run / "run now".
- [UI] Refresh admin-users page: add "Force sign-out" button independent of role change.

### QA
- [QA] Setting change updates dependent behavior on next request (no restart).
- [QA] Audit export reflects current filters.
- [QA] Job re-trigger writes an audit row.

---

## Phase 7 — Hardening & rollout

- [QA] Run replication guide §9 verification end-to-end on a fresh project (NFR-17, ≤ 30 min).
- [QA] Penetration sweep against RLS: anon and each role tries every endpoint.
- [OPS] Flip `NEXT_PUBLIC_DEMO_MODE=false` and validate Google OAuth flow.
- [OPS] Set up daily DB backups (Supabase Pro) and weekly storage snapshots.
- [QA] Load test IFO room-status polling at 30 concurrent admins.

---

## Dependency graph (summary)

```
Phase 0 (DB + audit + cron + push)
  ├── Phase 1 Faculty
  ├── Phase 2 IFO Admin       ← consumes Phase 1 sessions
  ├── Phase 3 Checker         ← consumes Phase 1 sessions
  ├── Phase 4 Guard           ← consumes Phase 1 assists
  ├── Phase 5 HR Admin        ← consumes everything above
  └── Phase 6 System Admin    ← consumes audit + settings
Phase 7 = release-gate
```

Phases 1–4 are independent and CAN run in parallel if staffed. Phase 5 needs all four; Phase 6 needs everything.

> **Sequencing note:** the class-lifecycle work (sections, term-span, archive, move) ships inside Phase 2 because IFO owns those surfaces. Phase 1 (Faculty) only consumes the new fields read-only (BR-FAC-23..24), so Phase 1 can ship its UI before Phase 2 wires up the editors as long as Phase 0's migration has run.
