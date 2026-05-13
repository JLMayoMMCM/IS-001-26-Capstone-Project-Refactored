# FluxTrack — Master Reference

> Consolidated from `README.md`, `replication/REPLICATION.md`, `replication/sql/02_schema_postgres.sql`, `replication/sql/04_rls_policies.sql`, `replication/sql/06_realtime.sql`, `replication/sql/07_user_devices.sql`, and the existing `fluxtrack/app/` route tree.
> SRS source-of-truth: `SRS/FluxTrack_SRS_v6.0.md` (not in this repo — referenced by the original docs).

---

## 1. System purpose

FluxTrack is the **Faculty Monitoring & Course Management System** for Mapua Malayan Colleges Mindanao (MMCM). It tracks:

- Whether faculty actually showed up to scheduled class sessions (F2F / Blended / Online).
- Live room occupancy across campus floors.
- Disputes and corrections raised against attendance records.
- HR-grade attendance records that feed payroll exports.

It is a **Next.js 16 (App Router) + Supabase (Postgres 15 + Auth + Realtime + Storage + Edge Functions)** stack with optional Web Push via VAPID.

---

## 2. Stack & runtime

| Layer | Tech | Notes |
|---|---|---|
| Frontend | Next.js 16 App Router (React 19.2) | App lives in `fluxtrack/app/`. NOT classic Next.js — see `fluxtrack/AGENTS.md`. |
| Auth | Supabase Auth + Google OAuth | Demo Mode bypasses auth via `fluxtrack_demo_role` cookie. |
| DB | PostgreSQL 15 on Supabase | 17 tables, 20 ENUM types, RLS enforced. |
| Realtime | Supabase Realtime (postgres_changes) | Published: `notifications`, `sessions`, `assist_requests`, `extension_requests`. |
| Storage | Supabase Storage | Private buckets: `session-photos`, `hr-exports`. Signed URLs (60s TTL). |
| Edge Fns | Deno on Supabase | `photo-cleanup`, `export-cleanup`, `push-send` (placeholder). |
| Push | Web Push + VAPID | Multi-device via `user_devices`. |
| Schedule | `pg_cron` | Daily cleanups + eight 5-minute monitors (absence, en-route expiry, overstay…). |

---

## 3. Roles (canonical)

ENUM `user_role`: `faculty`, `ifo_admin`, `checker`, `guard`, `hr_admin`, `system_admin`.

| Role | Primary surface | One-line job |
|---|---|---|
| `faculty` | `/faculty/*` | Check in / out of class, declare en-route, file disputes. |
| `ifo_admin` | `/ifo/*` | Live room map, manage schedules/bookings, approve disputes, force-end. |
| `checker` | `/checker/*` | Floor walks to physically verify F2F/Blended sessions. |
| `guard` | `/guard/*` | Floor view, acknowledge assist requests, log incidents. |
| `hr_admin` | `/hr/*` | Attendance records, payroll periods, lock/unlock, exports. |
| `system_admin` | `/admin/*` | Provision users, change roles, read audit log. |

---

## 4. Data model (17 tables)

| # | Table | Purpose |
|---|---|---|
| 1 | `users` | Mirror of `auth.users` + role, department, employment_type, push_subscription. |
| 2 | `rooms` | Physical rooms (code, building, floor, type, capacity). |
| 3 | `schedules` | Recurring weekly class instances (faculty × room × course × day × time). |
| 4 | `sessions` | Each concrete day's class instance. Core attendance record. |
| 5 | `en_route_declarations` | Faculty "I'm coming, hold the room" declarations. |
| 6 | `extension_requests` | Faculty asks for +N minutes; auto-approved if no incoming class. |
| 7 | `checker_validations` | A checker's verification action against a session. |
| 8 | `assist_requests` | Faculty assist requests to IFO/Guard (broken AV, locked room…). |
| 9 | `disputes` | Faculty contests an attendance result; IFO reviews. |
| 10 | `manual_bookings` | Non-class room reservations. |
| 11 | `payroll_periods` | HR pay-period buckets with `lock_stage`. |
| 12 | `hr_exports` | Audit trail of CSV/PDF exports. |
| 13 | `checker_shifts` | Daily duty assignments for checkers/guards. |
| 14 | `checker_shift_floors` | Floors assigned to a shift (junction). |
| 15 | `room_handover_conflicts` | Detected overlap when an incoming class taps an extended room. |
| 16 | `audit_log` | Append-only system event log (trigger-enforced). |
| 17 | `notifications` | In-app + push notification ledger. |

Plus the migration-added:
- **`user_devices`** — multi-device push subscriptions (already in `07_user_devices.sql`).
- **`system_settings`**, **`notification_preferences`** — runtime tunables + per-user mute (in `09_business_rules_migration.sql`).
- **`academic_terms`**, **`academic_breaks`**, **`sections`** — drives term-span materialization and section conflicts (in `09_*`).
- **`schedule_moves`** — audit/log of every class move (in `09_*`).

### Key ENUMs

- `session_status`: `scheduled`, `pending`, `active`, `en_route`, `completed`, `early_end`, `absent`, `overstay`, `checker_flagged`.
- `extension_status`: `none`, `pending`, `approved`, `denied`, `timed_out`, `auto_approved`.
- `en_route_reason` / `en_route_status` — for late arrivals.
- `checker_action`: `verified`, `flagged_absent`, `could_not_access`.
- `dispute_reason` / `dispute_status` / `dispute_source` — dispute lifecycle.
- `lock_stage`: `none`, `soft`, `hard`, `archived` — payroll period progression.
- `delivery_via`: `push`, `in_app`, `both`.

### Critical invariants

- `users.id = auth.users.id` (1:1, trigger-copied on signup; default role `faculty`).
- `audit_log` is append-only (trigger raises on UPDATE/DELETE).
- `extension_requests.requesting_session_id` is UNIQUE — one extension per session.
- `payroll_periods.lock_stage` gates mutability of contained sessions.
- All timestamps are `timestamptz` (UTC); times in `schedules` are bare `time` (Manila local).

---

## 5. Existing route surface

### App routes (rendered pages) — `fluxtrack/app/`

```
admin/admin-users
auth/login
checker/{checker-assists, checker-checklist, checker-dashboard}
faculty/{attendance, dashboard, schedule, settings/{preferences,profile}}
guard/{guard-dashboard, guard-notifications, guard-rooms}
hr/{hr-dashboard, hr-exports, hr-payroll, hr-records}
ifo/{ifo-bookings, ifo-dashboard, ifo-disputes, ifo-schedule, ifo-staff}
```

### API routes — `fluxtrack/app/apis/`

```
auth/{callback, signout}
users/{[id], me/{devices/[id], preferences}}
rooms/{[id], status}
schedules/{[id], import}
sessions/[id]/{start, en-route, extension, end}
bookings/[id]
assists/[id]/acknowledge
disputes/[id]/{approve, deny}
extensions/[id]/{approve, deny}
checker/shifts/{[id]/{start, end}, copy}
checker/validations
hr/{records, summary, payroll/[id]/finalize, exports}
notifications/{[id]/read, push, subscribe}
photos/{upload, [id]/signed-url}
wlan/check
test-connection
```

---

## 6. RLS posture (summary)

- **Anonymous** → denied; no policies match (except the four demo-mode realtime `auth.uid() IS NULL` policies for the four published tables).
- **Service role** → bypasses RLS entirely (used by API route handlers for cron, audits, etc.).
- **Authenticated** → matched against per-table policies via `auth.uid()` and helpers `public.is_role(...)`, `public.checker_floors_today()`.

Selected behaviors:

- `users`: self-read; admin roles can read all; only self/system_admin can update.
- `rooms`: everyone reads; IFO/system_admin write.
- `schedules`: faculty sees own; IFO/HR/system_admin see all; checker sees rows for rooms on today's assigned floors.
- `sessions`: faculty (own), IFO/HR/system_admin (all), checker (today's floor), guard (their floor).
- `checker_validations`: checker (own) + admins + faculty (own session).
- `disputes`: faculty (own) + IFO/HR/system_admin; only IFO/system_admin update.
- `payroll_periods` & `hr_exports`: HR/system_admin only.
- `audit_log`: only system_admin + hr_admin can SELECT; no INSERT/UPDATE/DELETE for authenticated.

---

## 7. Background work

### Daily (Manila local times)

- `03:00` — `photo-cleanup` → purge expired session photos (30-day retention).
- `03:30` — `export-cleanup` → purge expired HR exports (30-day retention).

### Every 5 minutes (per SRS Part 8 — 8 pg_cron jobs)

Absence detection, en-route expiry, extension auto-approval timeout, overstay flagging, courtesy-window expiry, handover-protection expiry, etc.

### Push delivery

`push-send` Edge Function (still a placeholder) — VAPID fan-out to all rows in `user_devices` for the recipient.

---

## 8. Demo Mode

- `NEXT_PUBLIC_DEMO_MODE=true` (default for capstone defense).
- Cookie `fluxtrack_demo_role` controls which role is "logged in."
- `auth.uid()` is NULL in demo → service-role API + the four `demo_select_realtime` policies keep the UI alive.
- The top-bar role switcher rotates the cookie and redirects to the role's home.

---

## 9. Known deferred items (from SRS markers / `.env` notes)

- **D-11** Realtime client subscriptions for IFO map (currently 8-s polling).
- **D-12** Microsoft Entra ID restoration.
- `push-send` Edge Function is a stub (README only).

---

## 10. Replication time budget (NFR-17)

Full bootstrap target: ≤ 30 minutes from clean checkout to a running dev instance with seeded users and rooms.

---

## 11. Companion documents in this folder

- [`01_BUSINESS_RULES.md`](01_BUSINESS_RULES.md) — per-role business rules (BR-*).
- [`02_FUNCTIONALITY.md`](02_FUNCTIONALITY.md) — per-role feature inventory mapped to existing routes / APIs / DB tables.
- [`03_IMPLEMENTATION_PLAN.md`](03_IMPLEMENTATION_PLAN.md) — phased rollout, one role per phase.
- [`04_DB_MODIFICATIONS.md`](04_DB_MODIFICATIONS.md) — narrative for the schema changes.
- [`../replication/sql/09_business_rules_migration.sql`](../replication/sql/09_business_rules_migration.sql) — DRAFT migration. **Not yet applied.**
