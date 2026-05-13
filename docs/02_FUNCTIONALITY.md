# FluxTrack — Functionality Inventory (by Role)

> For every role, this lists: (1) the UI pages that already exist as folder skeletons in `fluxtrack/app/`, (2) the API endpoints already scaffolded under `fluxtrack/app/apis/`, (3) the DB tables touched, and (4) the new functionality to be added on top.

Legend:
- **EXISTS** — folder/route exists in the repo today (may be empty/skeleton).
- **NEW** — to be created in the per-role implementation phase.

---

## Faculty

### Pages

| Path | Status | Function |
|---|---|---|
| `/faculty/dashboard` | EXISTS | Today's classes; live "active session" card with check-in CTA. |
| `/faculty/schedule` | EXISTS | Weekly grid of recurring `schedules`; toggle academic term. |
| `/faculty/attendance` | EXISTS | Historical sessions table + dispute filing entry-point. |
| `/faculty/settings/profile` | EXISTS | Edit `full_name`, `department`, registered devices. |
| `/faculty/settings/preferences` | EXISTS | Push subscription toggle, notification categories, theme. |
| `/faculty/assists` | NEW | List of own assist requests + "Request assist" form. |
| `/faculty/disputes` | NEW | Dedicated disputes list (mirror of HR/IFO view but own-only). |

### APIs

| Path | Status | Purpose / BRs |
|---|---|---|
| `apis/sessions/[id]/start` | EXISTS | BR-FAC-3..6, BR-FAC-14. |
| `apis/sessions/[id]/en-route` | EXISTS | BR-FAC-7..9. |
| `apis/sessions/[id]/extension` | EXISTS | BR-FAC-11..12. |
| `apis/sessions/[id]/end` | EXISTS | BR-FAC-10, BR-FAC-13. |
| `apis/assists` (POST) | EXISTS | BR-FAC-19. |
| `apis/disputes` (POST) | EXISTS | BR-FAC-15..18. |
| `apis/users/me` GET/PATCH | EXISTS | BR-FAC-21. |
| `apis/users/me/devices` CRUD | EXISTS | BR-FAC-14, BR-FAC-22. |
| `apis/users/me/preferences` | EXISTS | BR-NOT-4. |
| `apis/photos/upload` | EXISTS | BR-FAC-4, BR-GEN-7. |
| `apis/wlan/check` | EXISTS | BR-FAC-4. |

### DB

- Reads: `schedules`, `sessions`, `disputes`, `assist_requests`, `extension_requests`, `en_route_declarations`, `notifications`, `user_devices`, `rooms`, `users` (self).
- Writes: `sessions` (own status fields), `disputes`, `assist_requests`, `extension_requests`, `en_route_declarations`, `users` (self subset), `user_devices`.

### What's missing functionally

1. Dispute file-upload pipeline (evidence into `session-photos/disputes/<id>/`).
2. Course / room search inside the schedule page.
3. "Quick re-check WLAN" affordance during a long session (preventive nudge).
4. **Term-span badge** on each schedule row showing `term_start_date → term_end_date` and remaining weeks.
5. **Move / Archive banner** on faculty dashboard when an upcoming session was moved or its parent schedule was archived (driven by `schedule.moved` / `schedule.archived` notifications, BR-FAC-24).
6. **Section column** added to the schedule grid (read-only).

---

## IFO Admin

### Pages

| Path | Status | Function |
|---|---|---|
| `/ifo/ifo-dashboard` | EXISTS | Real-time room map (8-s polling), filters, room-detail modal w/ force-end. |
| `/ifo/ifo-schedule` | EXISTS | Schedule CRUD + CSV import preview; term-span editor; archive / restore; "Move class" wizard. |
| `/ifo/ifo-bookings` | EXISTS | Manual booking calendar / CRUD. |
| `/ifo/ifo-disputes` | EXISTS | Dispute queue: review, approve/deny w/ remedial-action picker. |
| `/ifo/ifo-staff` | EXISTS | Checker/Guard shift management; assign floors. |
| `/ifo/ifo-sections` | NEW | Section catalog CRUD (`(academic_term, section_code)` unique), conflict preview. |
| `/ifo/ifo-academic-calendar` | NEW | Define academic terms, term spans, holidays/breaks (drives auto-materialization windows). |
| `/ifo/ifo-assists` | NEW | Live assist feed with ack/escalate. |
| `/ifo/ifo-audit` | NEW | Read-only audit log view (also exposed to system_admin). |

### APIs

| Path | Status | Purpose / BRs |
|---|---|---|
| `apis/rooms/status` | EXISTS | Drives room map polling (BR-IFO-2). |
| `apis/rooms` CRUD | EXISTS | BR-IFO-1. |
| `apis/schedules` CRUD + `/import` | EXISTS | BR-IFO-8..9, BR-IFO-15..16 (term span on create/update). |
| `apis/schedules/[id]/archive` | NEW | BR-IFO-17 — soft-remove with reason; also restore via `POST /archive?restore=1`. |
| `apis/schedules/[id]/move` | NEW | BR-IFO-20..22 — wizard endpoint; validates room + section conflict pre-commit. |
| `apis/sections` CRUD + `[id]` | NEW | BR-IFO-23, BR-IFO-25 — catalog management. |
| `apis/sections/[id]/conflicts` | NEW | Read-only — returns active schedules that would collide with a hypothetical slot. |
| `apis/academic-terms` CRUD | NEW | Term definitions; powers the term-span pickers. |
| `apis/academic-breaks` CRUD | NEW | BR-IFO-27 — skipped dates during materialization. |
| `apis/bookings` CRUD | EXISTS | BR-IFO-7. |
| `apis/sessions/[id]` PATCH (force-end branch) | EXISTS | BR-IFO-4. |
| `apis/assists/[id]/acknowledge` | EXISTS | BR-IFO-5. |
| `apis/disputes/[id]/approve` | EXISTS | BR-IFO-10..11. |
| `apis/disputes/[id]/deny` | EXISTS | BR-IFO-10. |
| `apis/extensions/[id]/approve` | EXISTS | BR-FAC-12 (incoming-faculty perspective; IFO override). |
| `apis/extensions/[id]/deny` | EXISTS | BR-FAC-12. |
| `apis/audit` GET | NEW | BR-IFO/SYS read of `audit_log`. |

### DB

- Reads: all tables except `hr_exports` & `payroll_periods` (those are HR-only).
- Writes: `rooms`, `schedules`, `manual_bookings`, `sessions` (force-end fields + re-pointing during a move), `disputes`, `extension_requests`, `checker_shifts`, `checker_shift_floors`, `assist_requests` (ack fields), `sections`, `academic_terms`, `academic_breaks`, `schedule_moves` (audit/log of moves).

### What's missing functionally

1. Audit log viewer.
2. Bulk import progress UI for schedule CSVs.
3. Booking conflict pre-check (server-side) with friendly diff.
4. **Term-span editor** on schedules — pick `term_start_date`, `term_end_date`; preview the number of sessions that will materialize; warn if shortening would drop completed sessions.
5. **Archive / restore drawer** — soft-remove a class with a mandatory reason; "Restore" CTA appears in an "Archived" tab; restore is blocked when the room/time slot was reclaimed (BR-IFO-19).
6. **Move-class wizard** — step 1 pick effective date, step 2 pick new room/day/time/section, step 3 server-side conflict report (room + section), step 4 confirm; on commit, future `scheduled` sessions re-point and notifications fan out (BR-IFO-22, BR-FAC-24).
7. **Section catalog** — table with filters per `academic_term`; click a section to see all schedules using it (and a timeline view to spot empty/overloaded slots).
8. **Academic calendar** — define `academic_terms` (e.g. `2026-1T`) with default `term_start_date`/`term_end_date`, plus `academic_breaks` for holidays — these inputs gate session materialization.

---

## Checker

### Pages

| Path | Status | Function |
|---|---|---|
| `/checker/checker-dashboard` | EXISTS | Currently redirects to checklist; will host KPIs (rooms validated / skipped). |
| `/checker/checker-checklist` | EXISTS | Floor-grouped session list w/ Verify / Flag / CNA buttons. |
| `/checker/checker-assists` | EXISTS | Local floor's assist feed (read + ack). |
| `/checker/checker-shift-history` | NEW | Past shifts, validations counts, "copy shift" CTA. |

### APIs

| Path | Status | Purpose / BRs |
|---|---|---|
| `apis/checker/shifts` CRUD | EXISTS | Shift lifecycle. |
| `apis/checker/shifts/[id]/start` | EXISTS | BR-CHK-3. |
| `apis/checker/shifts/[id]/end` | EXISTS | BR-CHK-4. |
| `apis/checker/shifts/copy` | EXISTS | BR-CHK-9. |
| `apis/checker/validations` | EXISTS | BR-CHK-5..8. |

### DB

- Reads: `checker_shifts` (own), `checker_shift_floors` (own), `sessions` (today × floor), `schedules` (today × floor), `rooms`, `assist_requests`.
- Writes: `checker_validations`, `checker_shifts` (actual_start/end, counters), `assist_requests` (ack fields when on floor).

### What's missing functionally

1. Offline-friendly checklist (queue validations when on a flaky AP, replay on reconnect).
2. KPI tiles on `/checker-dashboard` instead of a redirect.

---

## Guard

### Pages

| Path | Status | Function |
|---|---|---|
| `/guard/guard-dashboard` | EXISTS | Floor room status mini-map + live assist feed. |
| `/guard/guard-rooms` | EXISTS | Full floor room directory (no edit). |
| `/guard/guard-notifications` | EXISTS | In-app notification inbox. |
| `/guard/guard-incidents` | NEW | History of guard's logged resolutions; filter by date/floor. |

### APIs

Guard reuses faculty/IFO endpoints with RLS doing the gatekeeping:
- `apis/rooms/status` (filtered to floor by RLS)
- `apis/assists` listing (RLS limits to floor)
- `apis/assists/[id]/acknowledge` w/ `guard_*` fields (BR-GRD-2)
- `apis/notifications` family

### DB

- Reads: `rooms`, `sessions` (floor only), `assist_requests` (floor only), `notifications` (own).
- Writes: `assist_requests` (guard ack fields), `notifications` (read state).

### What's missing functionally

1. Quick-pick resolution buttons (BR-GRD-2 enum) on the assist card.
2. Mandatory follow-up modal after ack: forces `guard_resolution_status` + note inside 30 min.

---

## HR Admin

### Pages

| Path | Status | Function |
|---|---|---|
| `/hr/hr-dashboard` | EXISTS | KPIs (modality drift %, no-show count, compliance %). |
| `/hr/hr-records` | EXISTS | Session table; filter by faculty, term, period, status. |
| `/hr/hr-payroll` | EXISTS | Payroll period list + finalize flow. |
| `/hr/hr-exports` | EXISTS | Generate + download CSV/PDF; export history. |
| `/hr/hr-disputes` | NEW | HR-flag a session into a `dispute` (BR-HR-2). |

### APIs

| Path | Status | Purpose / BRs |
|---|---|---|
| `apis/hr/records` | EXISTS | BR-HR-1, lock-aware. |
| `apis/hr/summary` | EXISTS | KPI aggregations. |
| `apis/hr/payroll` CRUD | EXISTS | BR-HR-5..10. |
| `apis/hr/payroll/[id]/finalize` | EXISTS | BR-HR-11. |
| `apis/hr/exports` POST | EXISTS | BR-HR-12..14. |
| `apis/hr/disputes/flag` | NEW | BR-HR-2 (HR-source dispute creation). |

### DB

- Reads: every operational table.
- Writes: `payroll_periods`, `hr_exports`, `disputes` (where `source = 'hr_flag'`), `sessions.hr_flag_*` fields.

### What's missing functionally

1. UI for HR to start an HR-flag dispute directly from a session row.
2. Export filter chip-bar (term, faculty, period, modality, status).
3. **"Include archived" toggle** on records list — defaults on, surfaces sessions whose parent `schedule` is soft-removed (BR-HR-4a).
4. **Move-history drawer** on a session detail — shows original schedule, effective_from, and new schedule when a move applies (BR-HR-4b).
5. **Section filter** in records and exports.

---

## System Admin

### Pages

| Path | Status | Function |
|---|---|---|
| `/admin/admin-users` | EXISTS | Provision users, change role, deactivate. |
| `/admin/admin-settings` | NEW | Edit `system_settings` tunables. |
| `/admin/admin-audit` | NEW | Audit log explorer; filters; CSV export. |
| `/admin/admin-jobs` | NEW | Cron job status (last run, next run); buttons to re-trigger. |

### APIs

| Path | Status | Purpose / BRs |
|---|---|---|
| `apis/users` CRUD + `[id]` | EXISTS | BR-SYS-2. |
| `apis/admin/settings` GET/PATCH | NEW | BR-SYS-4. |
| `apis/admin/audit` GET | NEW | BR-SYS-1, 6. |
| `apis/admin/jobs/run` POST | NEW | BR-SYS-5. |

### DB

- Reads: everything.
- Writes: `users` (any field), `system_settings` (new), `audit_log` (only via service role).

---

## Cross-role: Notifications subsystem

| Endpoint | Status | Purpose |
|---|---|---|
| `apis/notifications` GET | EXISTS | Inbox listing. |
| `apis/notifications/[id]/read` POST | EXISTS | Mark single read. |
| `apis/notifications/subscribe` POST | EXISTS | Register a push subscription. |
| `apis/notifications/push` POST | EXISTS | Server-side trigger (internal). |
| Edge fn `push-send` | PLACEHOLDER | Fan-out worker (BR-NOT-2). |

---

## Cross-role: Realtime channels

Tables published to `supabase_realtime`: `notifications`, `sessions`, `assist_requests`, `extension_requests`. Pages already wired:

- IFO dashboard (sessions, assist_requests)
- Guard dashboard (assist_requests via `useAssistFeed`)
- HR dashboard (sessions for KPI tiles via `useRealtimeChannel`)
- Faculty dashboard (sessions, extension_requests via `useActiveSession`)
