# FluxTrack Migration — Django + MSSQL

> Plan only. Nothing in this document touches `fluxtrack/`.
> Companion files: [`migration-sql/01_mssql_schema.sql`](./migration-sql/01_mssql_schema.sql) (DDL),
> [`migration-sql/02_data_etl.md`](./migration-sql/02_data_etl.md) (Postgres → MSSQL transfer).

---

## 1. What's changing

| Layer            | Today (Supabase + Next.js)                | Target                                                    |
| ---------------- | ----------------------------------------- | --------------------------------------------------------- |
| API + business   | `fluxtrack/app/apis/*` route handlers (~45) | `fluxtrack_backend/` — Django 5 + DRF                     |
| Database         | Supabase-managed **Postgres 15**          | **Microsoft SQL Server 2019+**                            |
| Auth             | Supabase Auth + Google OAuth + demo cookies | Django auth + Simple JWT + `django-allauth` (Google) + demo cookies (unchanged) |
| Realtime         | Supabase Realtime (Postgres logical → WS) | Django Channels over Redis                                |
| Object storage   | Supabase Storage bucket `session-photos`  | `django-storages` backend (local FS in dev; Azure Blob / S3 in prod) |
| Background jobs  | `pg_cron` (9 jobs)                        | Celery + celery-beat (Redis broker)                       |
| Web Push         | VAPID + `web-push` in Node                | VAPID + `pywebpush` in Django (same keypair)              |

Nothing in the frontend is rewritten in Phase 0. The Next.js app keeps its file structure, its `/apis/*` routes, and the demo cookie contract.

---

## 2. Target architecture

```
                                  ┌───────────────────────────────┐
   Faculty / IFO / HR / Admin     │   Next.js 16 frontend         │
   ─────────►  Browser  ─────────►│   fluxtrack/                  │
                                  │   - Server components (RSC)   │
                                  │   - Client components         │
                                  │   - /apis/* (kept; later thin │
                                  │     proxies to Django)        │
                                  └──────────────┬────────────────┘
                                                 │  HTTPS (JSON)
                                                 │  Cookies (demo) / Bearer (JWT)
                                                 ▼
                                  ┌───────────────────────────────┐
                                  │   fluxtrack_backend/ (Django) │
                                  │                                │
                                  │   - DRF viewsets               │
                                  │   - Channels consumers (WS)    │
                                  │   - Celery workers (monitors)  │
                                  │   - Celery beat (cron)         │
                                  └──┬──────────────────┬──────────┘
                                     │                  │
                                     │ pyodbc (TDS)     │ redis-py
                                     ▼                  ▼
                          ┌─────────────────┐  ┌─────────────────┐
                          │  MSSQL 2019+     │  │  Redis           │
                          │  - app data      │  │  - channel layer │
                          │  - audit log     │  │  - celery broker │
                          └─────────────────┘  └─────────────────┘

                          ┌─────────────────┐
                          │  Object storage │   ← session photos, dispute evidence
                          │  (Azure / S3)   │
                          └─────────────────┘
```

---

## 3. Repository layout after Phase 0–2

```
IS-001-26-Capstone-Project-Refactored/
├── fluxtrack/                   ← Next.js frontend (untouched in Phase 0)
├── fluxtrack_backend/           ← NEW Django service (created in Phase 1)
│   ├── manage.py
│   ├── pyproject.toml
│   ├── .env.example
│   ├── fluxtrack_backend/       ← Django project package
│   │   ├── settings/{base,dev,prod,test}.py
│   │   ├── asgi.py              ← Channels entry point
│   │   ├── wsgi.py
│   │   ├── urls.py
│   │   └── celery.py
│   ├── apps/                    ← Domain apps, one per bounded context
│   │   ├── core/                ← mixins, base model, perms
│   │   ├── users/               ← User, UserDevice, NotificationPreference
│   │   ├── rooms/
│   │   ├── academics/           ← AcademicTerm, AcademicBreak, Section
│   │   ├── schedules/           ← Schedule, ScheduleMove
│   │   ├── sessions/            ← Session, EnRoute, ExtensionRequest, Dispute, Handover
│   │   ├── attendance/          ← CheckerShift, CheckerShiftFloor, CheckerValidation
│   │   ├── assists/
│   │   ├── bookings/
│   │   ├── payroll/             ← PayrollPeriod, HrExport
│   │   ├── notifications/
│   │   ├── audit/
│   │   └── system/              ← SystemSetting
│   ├── monitors/                ← Celery beat tasks replacing pg_cron
│   ├── realtime/                ← Channels consumers + routing
│   ├── scripts/                 ← One-shots (etl.py lives here)
│   └── tests/
├── docs/
│   ├── 07_MIGRATION_DJANGO_MSSQL.md   ← THIS FILE
│   └── migration-sql/
│       ├── README.md
│       ├── 01_mssql_schema.sql
│       └── 02_data_etl.md
└── replication/                 ← Existing Postgres SQL (kept as historical reference)
```

Sibling-not-nested keeps each service installable and deployable on its own. The Next.js bundler doesn't see Python; Django's autoreloader doesn't crawl `node_modules`.

---

## 4. Tech stack — decisions table

| Concern              | Pick                                           | Why                                                            |
| -------------------- | ---------------------------------------------- | -------------------------------------------------------------- |
| Web framework        | **Django 5.x**                                 | Batteries included; ORM works on MSSQL via Microsoft's driver. |
| API serialization    | **Django REST Framework**                      | 1-to-1 fit with the existing JSON contracts in `/apis/*`.      |
| DB driver            | **`mssql-django`** + `pyodbc` + ODBC Driver 18 | Microsoft's officially supported adapter.                      |
| Auth (live)          | **`djangorestframework-simplejwt`** + `django-allauth` (Google provider) | JWT bearer for the SPA, OIDC for Google sign-in.              |
| Auth (demo)          | Custom middleware reading the existing `fluxtrack_demo_role` / `fluxtrack_demo_user_id` cookies | Keeps the frontend's demo flow unchanged.                      |
| Realtime             | **Django Channels** + Redis channel layer      | Same pub/sub model as Supabase Realtime; preserves the WS contract the frontend hook expects. |
| Background jobs      | **Celery 5** + **celery-beat** (Redis broker)  | Replaces `pg_cron`; tasks are normal Python and unit-testable.|
| File storage         | **`django-storages`** with pluggable backend   | Local FS in dev, Azure Blob / S3 in prod.                      |
| Web Push             | **`pywebpush`**                                | Reuses VAPID keypair already in `.env.local`.                  |
| Env vars             | **`django-environ`**                           | `.env` file + type-cast helpers.                               |
| ASGI server          | **Uvicorn** (under Gunicorn workers)           | Channels needs ASGI.                                           |
| Migrations           | Django ORM `makemigrations` / `migrate`        | DDL drift caught at CI by `--check`.                           |
| API docs             | **`drf-spectacular`**                          | Auto-generated OpenAPI 3 → frontend TS types regen.            |
| Lint / format / type | **ruff + black + mypy**                        | Standard.                                                      |
| Test                 | **pytest + pytest-django + factory_boy**       | Standard.                                                      |

---

## 5. Postgres → MSSQL — translation rules

### 5.1 Type mapping

| Postgres                              | MSSQL                                          | Notes |
| ------------------------------------- | ---------------------------------------------- | ----- |
| `uuid` (PK), default `gen_random_uuid()` | `UNIQUEIDENTIFIER` default `NEWSEQUENTIALID()` | UUIDs from the ETL are inserted explicitly; the default fires only for new app-created rows. Sequential UUIDs help index locality. |
| `timestamptz`                         | `DATETIMEOFFSET(3)` (ms precision)             | Carries the offset; `+08:00` for Manila preserved verbatim. |
| `date`                                | `DATE`                                         | — |
| `time`                                | `TIME(0)`                                      | Schedule columns truncate to whole seconds. |
| `interval`                            | (not used in target)                           | Where Postgres stored an interval, the app now stores an integer minute count. |
| `boolean`                             | `BIT`                                          | `True/False` ↔ `1/0`. |
| `inet`                                | `VARCHAR(45)`                                  | IPv4 + IPv6 fit. App writes the string form. |
| `text` / `varchar(n)`                 | `NVARCHAR(MAX)` / `NVARCHAR(n)`                | NVARCHAR everywhere for Unicode. |
| `bpchar(64)` (teams_link_hash)        | `CHAR(64)`                                     | — |
| `jsonb`                               | `NVARCHAR(MAX)` + `CHECK (ISJSON(col) = 1)`    | Reads via `JSON_VALUE` / `JSON_QUERY`. Django `JSONField` handles serialization. |
| `tstzrange` / `daterange`             | Stored as two columns + app-layer / trigger overlap check | See § 5.3. |
| Postgres `ENUM` types (21)            | `VARCHAR(n)` + named `CHECK (col IN (…))`      | The label string is unchanged so seed data round-trips. |

### 5.2 ENUM inventory (encoded as CHECK constraints in the DDL)

| Enum                       | Values                                                                                                                              |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `user_role`                | faculty, ifo_admin, checker, guard, hr_admin, system_admin                                                                          |
| `session_status`           | scheduled, pending, active, en_route, completed, early_end, absent, overstay, checker_flagged                                       |
| `modality`                 | f2f, blended, online                                                                                                                |
| `day_of_week`              | mon, tue, wed, thu, fri, sat                                                                                                        |
| `extension_status`         | none, pending, approved, denied, timed_out, auto_approved                                                                           |
| `booking_status`           | active, cancelled                                                                                                                   |
| `employment_type`          | full_time, part_time                                                                                                                |
| `room_type`                | lecture, lab, seminar, conference, other                                                                                            |
| `checker_action`           | verified, flagged_absent, could_not_access                                                                                          |
| `cna_reason`               | room_locked, restricted_access, room_not_found, other                                                                               |
| `dispute_reason`           | wlan_issue, camera_issue, schedule_error, checker_error, other                                                                      |
| `dispute_status`           | pending, approved, denied, escalated                                                                                                |
| `dispute_source`           | faculty, hr_flag                                                                                                                    |
| `dispute_remedial_action`  | restore_completed, mark_early_end, keep_status, manual_adjust                                                                       |
| `delivery_via`             | push, in_app, both                                                                                                                  |
| `export_format`            | csv, pdf                                                                                                                            |
| `lock_stage`               | none, soft, hard, archived                                                                                                          |
| `en_route_reason`          | current_class, traffic, commute, other                                                                                              |
| `en_route_status`          | active, expired, cancelled, resolved                                                                                                |
| `checker_guard_role`       | checker, guard                                                                                                                      |
| `guard_resolution`         | resolved_onsite, referred_ifo, referred_external, no_issue, other                                                                   |

### 5.3 GIST exclusion constraints → triggers

Postgres has two `EXCLUDE USING gist` constraints. MSSQL has no equivalent native operator-based exclusion, so each is replaced by an `AFTER INSERT, UPDATE` trigger that runs the same overlap query and rolls back on conflict.

| Postgres constraint                       | MSSQL replacement                                  |
| ----------------------------------------- | -------------------------------------------------- |
| `schedules.sched_no_section_overlap`      | `trg_schedules_no_section_overlap` — rejects when another active schedule for the same `section_id` + `day_of_week` overlaps the `[start_time, end_time)` window. |
| `payroll_periods.pp_no_overlap`           | `trg_payroll_periods_no_overlap` — rejects when an existing period's `[date_from, date_to]` overlaps inclusively. |

Both checks are *also* enforced by Django `Model.clean()` so the API returns a structured 400 before the SQL trigger fires.

### 5.4 Triggers / functions → app-layer signals + service functions

| Postgres construct                              | Replacement                                                              |
| ----------------------------------------------- | ------------------------------------------------------------------------ |
| `tg_set_updated_at` / `touch_user_devices_updated_at` | MSSQL `AFTER UPDATE` triggers (`trg_*_touch_updated_at`) on the two tables that need it. |
| `tg_emit_audit`                                 | `core.audit.AuditMixin` Django model mixin that writes to `audit_log` in `save()` / `delete()`. |
| `tg_users_force_signout`                        | Django `post_save` signal on `User` writes the `signout_after` field; JWT middleware honors it on every request. |
| `tg_block_locked_session_update`                | MSSQL `AFTER UPDATE` trigger AND `Session.save()` guard — defence in depth. |
| `tg_disputes_maintain_period_count`             | MSSQL `AFTER INSERT, UPDATE, DELETE` trigger recomputes `payroll_periods.open_disputes_count`. |
| `current_role()`, `is_role()`                   | DRF `permissions.py` + `User.is_role(…)` method.                         |
| `checker_floors_today()`                        | `attendance.services.checker_floors_today(user, date)` Python function. |
| `fn_move_schedule(...)`                         | `schedules.services.move_schedule(...)`                                   |
| `fn_materialize_sessions(...)`                  | `monitors/materialize_sessions.py` Celery task                            |
| `fn_settings_int(...)`                          | `system.services.get_int_setting(key, default)`                           |
| `fn_monitor_*` (8 functions)                    | One Celery task each under `monitors/`                                    |

### 5.5 Row-level security → app-layer permissions

Postgres RLS is dropped. DRF replaces it via three layers:

1. **Authentication** — JWT (live) or demo middleware → `request.user`.
2. **Permission classes** — per-viewset role gates (`IsFaculty`, `IsIfoOrSystemAdmin`, …) under `apps/core/permissions.py`.
3. **Queryset filtering** — `get_queryset()` overrides per viewset (faculty sees only own sessions; checkers see only sessions in their floor scope today; etc.).

Trade-offs vs RLS:
- ➕ Easier to debug ("403 from `IsIfoOrSystemAdmin`") and unit-test.
- ➕ Clearer error messages back to the client.
- ➖ Bypassable from a shell with raw DB access — accepted because the DB is not directly exposed in this deployment topology.

---

## 6. Django app blueprint

24 Postgres tables fold into 12 Django apps grouped by domain. Each app exposes `models.py`, `serializers.py`, `views.py` (DRF), `urls.py`, `services.py`, `signals.py`, `tasks.py` (Celery), and `tests/`.

| App              | Models (→ tables)                                                                                                                | Notable services / signals |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `core`           | `BaseModel`, `TimestampedModel`, `AuditMixin`, `permissions.IsRole(…)`                                                            | shared building blocks     |
| `users`          | `User` (custom AbstractBaseUser), `UserDevice`, `NotificationPreference` → `users`, `user_devices`, `notification_preferences` | `force_signout(user)`; post-save signal stamps `signout_after` |
| `rooms`          | `Room` → `rooms`                                                                                                                  | `RoomViewSet`              |
| `academics`      | `AcademicTerm`, `AcademicBreak`, `Section` → `academic_terms`, `academic_breaks`, `sections`                                      | `current_term()` helper    |
| `schedules`      | `Schedule`, `ScheduleMove` → `schedules`, `schedule_moves`                                                                        | `services.move_schedule(...)`; `Schedule.clean()` overlap check |
| `sessions`       | `Session`, `EnRouteDeclaration`, `ExtensionRequest`, `Dispute`, `RoomHandoverConflict` → 5 tables                                 | `start_session`, `end_session`, `request_extension`, `declare_en_route`, `file_dispute` services |
| `attendance`     | `CheckerShift`, `CheckerShiftFloor`, `CheckerValidation` → 3 tables                                                               | `checker_floors_today(user, date)` |
| `assists`        | `AssistRequest` → `assist_requests`                                                                                               | escalation timing logic    |
| `bookings`       | `ManualBooking` → `manual_bookings`                                                                                               | room-availability checks   |
| `payroll`        | `PayrollPeriod`, `HrExport` → `payroll_periods`, `hr_exports`                                                                     | lock-state transitions, CSV/PDF export |
| `notifications`  | `Notification` → `notifications`                                                                                                  | `send_push(user, payload)`; `broadcast(table, payload)` (Channels) |
| `audit`          | `AuditLog` → `audit_log`                                                                                                          | `record(actor, event, target, payload)` |
| `system`         | `SystemSetting` → `system_settings`                                                                                               | typed getters (`get_int`, `get_bool`, `get_minutes`) |

Cross-app conventions:

- **PKs**: every model uses `id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)` — same UUID values as today.
- **Timestamps**: `created_at`, `updated_at` come from `TimestampedModel` in `core`. Django pre-save signal updates `updated_at`; MSSQL trigger is a backstop on tables where the trigger already lives in the schema.
- **Audit**: domain models that emit audit rows inherit `AuditMixin`. The mixin's `save()` queues a `core.audit.record(...)` call in a `transaction.on_commit` hook so audit never leaks half-committed state.
- **Soft delete / archive**: `Schedule.archived_at` and a custom manager `Schedule.objects.active()` keeps archived rows hidden by default.

---

## 7. API surface mapping

Frontend keeps calling `/apis/*` during transition (Phase 11A); Django serves under `/api/v1/*`. The proxy phase rewrites Next.js handlers as thin forwarders, then Phase 11B drops the prefix entirely.

| Domain        | Next.js (today)                                                                                                          | Django (target)                                 |
| ------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| Auth          | `POST /apis/auth/google`, `/callback`, `/signout`                                                                        | `dj-rest-auth` + `allauth.socialaccount`        |
| Users         | `GET /apis/users`, `GET/POST /apis/users/{id}`, `/me`, `/me/devices`, `/me/preferences`                                  | `users.UserViewSet` + nested device / pref      |
| Demo          | `GET /apis/demo/users?role=…`                                                                                            | `users.views.DemoUsersView` (gated by `DEMO_MODE`) |
| Rooms         | `GET /apis/rooms`, `/apis/rooms/status`                                                                                  | `rooms.RoomViewSet`, `rooms.RoomStatusView`     |
| Schedules     | `GET /apis/schedules`, `/{id}`, `/{id}/archive`, `/{id}/move`, `/import`                                                 | `schedules.ScheduleViewSet` + extra actions     |
| Sessions      | `GET/POST /apis/sessions`, `/{id}`, `/{id}/start`, `/end`, `/extension`, `/en-route`                                     | `sessions.SessionViewSet`                       |
| Extensions    | `/apis/extensions/{id}/approve`, `/deny`                                                                                 | `sessions.ExtensionRequestViewSet`              |
| Disputes      | `/apis/disputes`, `/{id}`, `/approve`, `/deny`                                                                           | `sessions.DisputeViewSet`                       |
| Assists       | `/apis/assists`, `/{id}/acknowledge`                                                                                     | `assists.AssistRequestViewSet`                  |
| Checker       | `/apis/checker/shifts`, `/copy`, `/{id}/start`, `/end`, `/apis/checker/validations`                                      | `attendance.CheckerShiftViewSet`, `CheckerValidationViewSet` |
| Bookings      | `/apis/bookings`, `/{id}`                                                                                                | `bookings.ManualBookingViewSet`                 |
| HR            | `/apis/hr/summary`, `/records`, `/exports`, `/payroll`, `/payroll/{id}/finalize`                                         | `payroll.*`                                     |
| Notifications | `/apis/notifications`, `/{id}/read`, `/subscribe`                                                                        | `notifications.NotificationViewSet`             |
| Photos        | `/apis/photos/upload`, `/{id}/signed-url`                                                                                | `sessions.PhotoUploadView`, `PhotoSignedUrlView` |
| Academic      | `/apis/academic-terms`, `/academic-breaks`, `/sections`                                                                  | `academics.*`                                   |
| Admin         | `/apis/admin/*` (settings, jobs, audit)                                                                                  | `system.AdminViewSet`, `audit.AuditViewSet`     |
| WLAN attest   | `/apis/wlan/*`                                                                                                           | `sessions.WlanAttestationView`                  |
| Health        | `/apis/test-connection`                                                                                                  | `/api/v1/health`                                |

The Django side publishes `openapi.yaml` via `drf-spectacular`. The frontend's TS types are regenerated from it during the proxy phase to detect drift.

---

## 8. Replacements for Supabase-specific pieces

### 8.1 Realtime → Django Channels

- Five tables are watched by the frontend hook `use-realtime-channel.ts`: `sessions`, `notifications`, `assist_requests`, `extension_requests`, `disputes`.
- Each Django model has a `post_save` (+ `post_delete`) signal that publishes `{eventType, new, old}` to a Channel group keyed by `<table>:<scope>` (e.g. `sessions:<faculty_id>`).
- A single Channels consumer (`realtime/consumers.py`) authenticates the WS handshake via a JWT in the query string, joins the requested group, and forwards messages to the client.
- WS endpoint: `wss://<host>/ws/<table>?scope=…&token=…`. The frontend hook is updated only in Phase 6 — same payload shape so consumers don't change.

### 8.2 Auth — both flows preserved

- **Live mode** (Google OAuth) — `django-allauth` social login → `dj-rest-auth` issues a Simple JWT pair (access + refresh). Existing OAuth client credentials in `.env.local` re-pointed at Django's callback URL.
- **Demo mode** — Django middleware `apps.users.middleware.DemoUserMiddleware` reads `fluxtrack_demo_role` and `fluxtrack_demo_user_id` cookies, resolves the user, and attaches it to `request.user`. Activated only when `settings.DEMO_MODE` is true. Same selection rule as today (pinned UUID → first-of-role fallback).

### 8.3 Storage → `django-storages`

- Dev: `FileSystemStorage` at `fluxtrack_backend/media/`.
- Prod: Azure Blob (`django-storages[azure]`) or S3 (`django-storages[boto3]`) — driven by env var `STORAGE_BACKEND=azure|s3|local`.
- Upload flow: client POSTs to `/api/v1/photos/upload` (multipart). Server validates ownership + size (5 MB cap) and writes via the storage backend. The session row records the storage key.
- Read flow: `GET /api/v1/photos/{id}/signed-url` returns a 5-minute pre-signed URL.

### 8.4 Background jobs — pg_cron → Celery beat

| pg_cron job (today)                   | Cadence       | Celery task (target)                       |
| ------------------------------------- | ------------- | ------------------------------------------ |
| `fluxtrack_absence`                   | `*/5 * * * *` | `monitors.absence.run`                     |
| `fluxtrack_overstay`                  | `*/5 * * * *` | `monitors.overstay.run`                    |
| `fluxtrack_en_route_expiry`           | `*/5 * * * *` | `monitors.en_route_expiry.run`             |
| `fluxtrack_extension_timeout`         | `*/5 * * * *` | `monitors.extension_timeout.run`           |
| `fluxtrack_assist_escalation`         | `*/5 * * * *` | `monitors.assist_escalation.run`           |
| `fluxtrack_handover_protection`       | `*/5 * * * *` | `monitors.handover_protection.run`         |
| `fluxtrack_payroll_soft_expiry`       | `*/5 * * * *` | `monitors.payroll_lifecycle.run_soft`      |
| `fluxtrack_payroll_archive`           | `*/5 * * * *` | `monitors.payroll_lifecycle.run_archive`   |
| `fluxtrack_session_materializer`      | `0 17 * * *`  | `monitors.materialize_sessions.run`        |

Every monitor is idempotent. Concurrency control uses `SELECT … WITH (UPDLOCK, READPAST)` so two workers can't double-process the same row. Each task writes a result row to a `monitor_runs` table (`task_name`, `started_at`, `completed_at`, `affected_rows`, `error`) for ops visibility.

---

## 9. Phase plan

| Phase | Deliverable                                                                                                                  | Done-when gate                                                                          |
| ----- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 0     | This plan + DDL + ETL doc                                                                                                    | ✅ committed under `docs/`                                                                |
| 1     | `fluxtrack_backend/` Django project boots, `manage.py check` green, `/api/v1/health` returns 200, MSSQL connection live      | `pytest -q` passes; ruff clean                                                          |
| 2     | All 24 models + DRF serializers + `makemigrations --check` is clean; DDL match between Django migrations and `01_mssql_schema.sql` | model-vs-DDL diff = 0                                                                   |
| 3     | One-shot ETL run: Postgres demo → MSSQL load with row-count parity                                                           | every table count matches; FK-orphan scan returns 0                                     |
| 4     | All read endpoints (GET) under `/api/v1/*` with permission classes + queryset scoping                                        | per-viewset unit tests cover faculty / IFO / HR / system_admin                          |
| 5     | All write endpoints (POST/PATCH/DELETE) plus monitor tasks                                                                   | integration tests + double-run idempotency tests                                        |
| 6     | Channels consumers and frontend WS hook rewrite (frontend change confined to one hook file)                                  | 60-minute soak in staging with zero dropped messages                                    |
| 7     | Storage backend wired; check-in photo round-trip works                                                                       | manual F2F check-in in staging                                                          |
| 8     | Google OAuth + demo middleware                                                                                               | login works from a clean browser in both modes                                          |
| 9     | All 9 monitors running as Celery beat                                                                                        | parallel-run week vs `pg_cron` shows identical row deltas                               |
| 10    | Next.js `/apis/*` rewritten as thin proxies to `/api/v1/*`, one domain at a time                                             | each domain soaked for one week in staging before prod promote                          |
| 11A   | Frontend `fetch()` calls swapped to `/api/v1/*`                                                                              | smoke pass                                                                              |
| 11B   | Remove `fluxtrack/app/apis/` and decommission Supabase project                                                               | 30-day rollback window expires                                                          |

Phases 1–9 happen in `fluxtrack_backend/` and `docs/`. Phase 10+ are the only steps that touch `fluxtrack/`.

---

## 10. Risks & mitigations

| Risk                                                                                  | Mitigation                                                                                                              |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `mssql-django` quirks (esp. `JSONField` lookups, deferred FK constraints)             | Pin to a tested version. A `tests/test_db_compat.py` exercises every field type before business logic lands.            |
| Replacement triggers slower than Postgres GIST                                        | The Postgres index was effectively a B-tree on `(section_id, day_of_week)` anyway. The MSSQL trigger reads the same shape and an explicit index makes it sub-millisecond. |
| Realtime broadcast volume on heavy days                                               | Group subscriptions by `faculty_id` / `building`, not global. Redis comfortably handles 10k msg/s on commodity hardware. |
| Celery worker crash leaves monitors idle                                              | Two worker replicas; celery-beat as singleton; `/api/v1/health` deep-check pings the worker queue.                       |
| Cookie demo mode breaks under cross-origin                                            | Phase 10 proxy keeps cookies same-origin. Phase 11 (cross-origin) uses `SameSite=None; Secure` over HTTPS only.          |
| ETL type drift (JSON / timestamptz edge cases)                                        | Per-table round-trip assertion of a sample N rows before committing the load. ETL script aborts on first mismatch.       |
| Loss of `auth.users` FK (Supabase-owned)                                              | FK dropped intentionally. Identity is now Django-managed. UUIDs are preserved so cross-system references resolve.        |
| Manila timezone drift                                                                 | All `DATETIMEOFFSET` reads/writes go through `apps.core.tz` helper pinned to `+08:00`. The frontend's `manilaDateKey` keeps working unchanged. |
| Loss of `pg_cron` log visibility                                                      | `monitor_runs` table + an admin view in IFO surface task health.                                                         |

---

## 11. First 12 PRs (sketch)

A concrete order an implementer can follow once Phase 0 is signed off. None of these touch `fluxtrack/`.

1. `fluxtrack_backend/` — Django project skeleton + `pyproject.toml` + `manage.py check`.
2. MSSQL connection wired via `mssql-django`; `python manage.py dbshell` works.
3. `apps/core/` — base models, mixins, permission classes.
4. `apps/users/` — User model + custom manager + JWT login + demo middleware.
5. `apps/rooms/` + `apps/academics/` — leaf domains, easiest first.
6. Run `01_mssql_schema.sql` once; diff against `makemigrations --dry-run --verbosity 3` until clean.
7. `scripts/etl.py` end-to-end against the demo Supabase project.
8. `apps/schedules/` + overlap check + DRF viewset + tests.
9. `apps/sessions/` + all five sub-models + service layer.
10. `apps/attendance/` + checker scoping helper.
11. `monitors/` — port all 9 cron jobs as Celery tasks with idempotency tests.
12. `realtime/` — Channels routing + consumers + first WS handshake test.

Each PR ships green tests and lint, with `drf-spectacular` regen included so the OpenAPI doc stays current.

---

## 12. References

- Existing Postgres schema: [`replication/sql/02_schema_postgres.sql`](../replication/sql/02_schema_postgres.sql)
- Existing RLS policies: [`replication/sql/04_rls_policies.sql`](../replication/sql/04_rls_policies.sql)
- Existing business-rules migration: [`replication/sql/09_business_rules_migration.sql`](../replication/sql/09_business_rules_migration.sql)
- Existing cron monitors: [`replication/sql/10_cron_monitors.sql`](../replication/sql/10_cron_monitors.sql)
- Frontend API routes: [`fluxtrack/app/apis/`](../fluxtrack/app/apis/)
- Realtime hook: [`fluxtrack/hooks/use-realtime-channel.ts`](../fluxtrack/hooks/use-realtime-channel.ts)
- `mssql-django` driver: <https://github.com/microsoft/mssql-django>
- Django Channels: <https://channels.readthedocs.io/>
- Celery beat: <https://docs.celeryq.dev/en/stable/userguide/periodic-tasks.html>
- `pywebpush`: <https://github.com/web-push-libs/pywebpush>
