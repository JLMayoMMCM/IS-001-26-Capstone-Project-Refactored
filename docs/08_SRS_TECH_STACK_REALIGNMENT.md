# FluxTrack — Software Requirements Specification

**Version:** 7.0 — *Tech Stack Realignment*
**Supersedes:** FluxTrack SRS v6.0 (Supabase + Next.js)
**Status:** Draft for stakeholder review
**Owners:** FluxTrack capstone team — Mapua Malayan Colleges Mindanao (MMCM)

> Successor SRS to v6.0. This revision re-anchors the system on a polyglot, vendor-portable stack and replaces every Supabase-coupled component with an open or framework-native equivalent. Functional behaviour is unchanged from v6.0; the contract with end users, the role model, and the business rules carried forward verbatim.

---

## Document map

1. [Introduction](#1-introduction)
2. [Overall description](#2-overall-description)
3. [External interfaces](#3-external-interfaces)
4. [Tech stack architecture](#4-tech-stack-architecture)
5. [Database specification](#5-database-specification)
6. [Functional requirements (by role)](#6-functional-requirements-by-role)
7. [Non-functional requirements](#7-non-functional-requirements)
8. [External integrations](#8-external-integrations)
9. [Operational requirements](#9-operational-requirements)
10. [Migration & cut-over](#10-migration--cut-over)
11. [Acceptance criteria](#11-acceptance-criteria)
12. [Risks & open items](#12-risks--open-items)
- [Appendix A — ENUM inventory](#appendix-a--enum-inventory)
- [Appendix B — Table inventory](#appendix-b--table-inventory)
- [Appendix C — API endpoint mapping](#appendix-c--api-endpoint-mapping)
- [Appendix D — Glossary](#appendix-d--glossary)

---

## 1. Introduction

### 1.1 Purpose

FluxTrack is the **Faculty Monitoring & Course Management System** for MMCM. It records whether faculty actually showed up to scheduled class sessions (F2F / Blended / Online), maintains the live occupancy of campus rooms, tracks disputes raised against attendance records, and produces HR-grade exports that feed payroll.

SRS v7.0 specifies the same product against a new technology baseline:

- **Frontend:** Next.js (App Router) — *unchanged* in purpose, reused as the user-facing tier.
- **Backend:** Django 5 + Django REST Framework (DRF) — new, replacing the in-process Next.js route handlers and Supabase-managed services.
- **Database:** **Microsoft SQL Server (MSSQL) or MySQL 8+** — chosen at deployment time; both targets are supported by the same Django ORM models and migration set.

### 1.2 Document scope

This SRS covers:

- Re-affirmed user-facing functional requirements inherited from v6.0.
- New architectural and data-layer requirements introduced by the tech-stack realignment.
- The full external interface contract (REST API, WebSocket realtime, object storage, web push, OIDC).
- Non-functional requirements (performance, security, availability, audit, accessibility).
- Database portability rules covering both MSSQL and MySQL.

This SRS deliberately does **not** prescribe implementation code paths beyond the level needed to bind requirements to verifiable acceptance criteria. The implementation plan and SQL artefacts live in companion documents (§1.4).

### 1.3 Definitions & acronyms

| Term | Meaning |
| --- | --- |
| **Faculty** | A teaching staff member who delivers scheduled class sessions. |
| **IFO Admin** | Institutional Facilities Office administrator — manages rooms, schedules, bookings, disputes. |
| **Checker** | Roving staff who physically verify F2F / Blended sessions on assigned floors. |
| **Guard** | Security personnel who acknowledge assist requests and log incidents. |
| **HR Admin** | Human Resources staff who own attendance records, payroll periods, and exports. |
| **System Admin** | Provisions users, sets roles, reads the audit log. |
| **Schedule** | A recurring weekly class entry (faculty × room × course × day × time × term). |
| **Session** | One concrete day's instance of a schedule; the core attendance record. |
| **Modality** | `f2f`, `blended`, or `online`. |
| **Demo Mode** | Cookie-driven identity mode for capstone defence (no real auth). |
| **RBAC** | Role-based access control. |
| **DRF** | Django REST Framework. |
| **ORM** | Object-relational mapper (Django's). |
| **WSS / WS** | WebSocket (secure / plain). |
| **VAPID** | Voluntary Application Server Identification — keypair for Web Push. |
| **MSSQL** | Microsoft SQL Server 2019+. |
| **MySQL** | MySQL 8.0+. |
| **JWT** | JSON Web Token. |
| **OIDC** | OpenID Connect. |

### 1.4 References

| Ref | Document |
| --- | --- |
| R-1 | [00_REFERENCE.md](./00_REFERENCE.md) — master reference (legacy stack). |
| R-2 | [01_BUSINESS_RULES.md](./01_BUSINESS_RULES.md) — BR catalogue (carried forward unchanged). |
| R-3 | [02_FUNCTIONALITY.md](./02_FUNCTIONALITY.md) — per-role feature inventory. |
| R-4 | [03_IMPLEMENTATION_PLAN.md](./03_IMPLEMENTATION_PLAN.md) — phased rollout (legacy plan). |
| R-5 | [04_DB_MODIFICATIONS.md](./04_DB_MODIFICATIONS.md) — schema delta narrative (Postgres-era). |
| R-6 | [07_MIGRATION_DJANGO_MSSQL.md](./07_MIGRATION_DJANGO_MSSQL.md) — migration plan to Django + MSSQL. |
| R-7 | [migration-sql/01_mssql_schema.sql](./migration-sql/01_mssql_schema.sql) — executable DDL. |
| R-8 | [migration-sql/02_data_etl.md](./migration-sql/02_data_etl.md) — Postgres → MSSQL ETL procedure. |
| R-9 | Original SRS — `SRS/FluxTrack_SRS_v6.0.md` (external to this repo). |

### 1.5 Document conventions

- **MUST / SHOULD / MAY** follow [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119).
- **BR-`<ROLE>`-`<n>`** — business rule identifiers carried verbatim from v6.0.
- **NFR-`<n>`** — non-functional requirement identifiers.
- **D-`<n>`** — deferred requirement (tracked but out of scope for the current cycle).
- **APP-`<n>`** — application-layer requirement specific to v7.0.
- All wall-clock times are stated in **Asia/Manila** (UTC+8). All stored timestamps are UTC-offset-aware.

### 1.6 What changed since v6.0

| Concern | v6.0 (Supabase) | v7.0 (Realigned) |
| --- | --- | --- |
| Backend logic | Next.js Route Handlers (~45) inside `fluxtrack/app/apis/` | **Django 5 + DRF service at `fluxtrack_backend/`** |
| Database | Supabase-managed Postgres 15 | **MSSQL 2019+ or MySQL 8+** (chosen at deploy time) |
| Auth | Supabase Auth + Google OAuth | **Django auth + Simple JWT + `django-allauth` (Google)**; demo cookies preserved |
| Realtime | Supabase Realtime (logical replication → WebSocket) | **Django Channels + Redis** |
| Object storage | Supabase Storage bucket `session-photos` | **`django-storages` (Azure Blob / S3 / local FS)** |
| Background jobs | `pg_cron` (9 jobs) | **Celery + celery-beat (Redis broker)** |
| Web Push | VAPID via `web-push` (Node) | **VAPID via `pywebpush` (Python)** — same keypair |
| Row-level security | Postgres RLS + helper functions | **Application-layer DRF permissions + queryset filtering** |
| GIST exclusion constraints | Native to Postgres | **App-level pre-save + database triggers** in MSSQL/MySQL |
| Frontend | Next.js 16 App Router | *Unchanged* — `fluxtrack/` left as-is in Phase 0 |

No user-visible behaviour change is required for the realignment to land. The objective is a like-for-like swap underneath.

---

## 2. Overall description

### 2.1 Product perspective

FluxTrack is a single-institution, internally-hosted web application. It is operated by MMCM staff against a fixed pool of rooms, faculty, and academic terms. Users interact through a responsive web UI; staff in the field (checkers, guards) use the same UI on tablets / phones.

The new architecture cleanly separates concerns:

```
            ┌────────────────────────┐     HTTPS / WSS / Web Push
   Browser ─┤  Next.js frontend       │◄──────────────────────────┐
            │  (fluxtrack/)           │                           │
            └─────────────┬──────────┘                           │
                          │ JSON over HTTPS                       │
                          ▼                                       │
            ┌────────────────────────┐                           │
            │  Django backend         │  Channels (WS) ───────────┘
            │  (fluxtrack_backend/)   │
            │  - DRF viewsets         │
            │  - Celery workers       │
            │  - Celery beat          │
            └────────┬───────────────┘
                     │
        ┌────────────┼──────────────┐
        ▼            ▼              ▼
   ┌──────────┐ ┌─────────┐  ┌──────────────┐
   │ MSSQL or │ │ Redis   │  │  Object       │
   │ MySQL    │ │         │  │  storage      │
   └──────────┘ └─────────┘  └──────────────┘
```

### 2.2 Product functions (high-level)

1. Faculty check-in and check-out for every scheduled session, with modality-specific evidence (photo for F2F/blended, Teams link hash for online).
2. Late arrival ("en route") declaration with a configurable hold.
3. Extension request workflow with optional auto-approval.
4. Live room occupancy across campus floors (IFO).
5. Checker floor walks with verification, absence flag, and "could not access" reasons.
6. Guard floor view, assist acknowledgement, and incident logging.
7. Dispute filing and IFO review with remedial-action selection.
8. HR-grade attendance records, payroll period lock-stages, and CSV/PDF exports.
9. Notifications — in-app + Web Push fan-out.
10. Audit log (append-only) for every state-changing action.

### 2.3 User classes & characteristics

| Role | Count (typical) | Primary device | Network expectation |
| --- | --- | --- | --- |
| Faculty | ~150 | Laptop or phone | Campus WLAN during F2F; off-campus possible during online |
| IFO Admin | 2–4 | Desktop | Wired campus LAN |
| Checker | 6–10 | Tablet / phone | Campus WLAN |
| Guard | 6–10 | Phone | Campus WLAN |
| HR Admin | 2–4 | Desktop | Wired campus LAN |
| System Admin | 1–2 | Desktop | Wired campus LAN |

All users are MMCM-account-holders (`@mmcm.edu.ph`). The system MUST treat any non-MMCM identity as denied (BR-GEN-4).

### 2.4 Operating environment

| Component | Supported targets |
| --- | --- |
| Browser | Chrome ≥ 116, Edge ≥ 116, Safari ≥ 16, Firefox ≥ 116. Mobile Safari (iOS 16+) and Chrome on Android 11+. |
| Frontend runtime | Next.js 16 App Router served by Node.js 20+ (or a static export behind a reverse proxy if not using SSR features). |
| Backend runtime | Python 3.11+ on Linux (Ubuntu 22.04 LTS) or Windows Server 2019+. |
| Database | **MSSQL 2019+** *or* **MySQL 8.0+**. The Django ORM models and migration set support both via the corresponding driver. Either is selected per deployment. |
| Cache / broker / channel layer | Redis 7+. |
| Object storage | Azure Blob Storage, AWS S3, or local filesystem (dev only). |
| Reverse proxy / TLS | Nginx or IIS, terminating TLS 1.2+. |

### 2.5 Design & implementation constraints

| C-# | Constraint |
| --- | --- |
| C-1 | **Vendor portability for the database.** Schema MUST express ENUMs as `VARCHAR(n) + CHECK (col IN (…))` constraints, not as vendor-specific ENUM types. JSON columns MUST use the database's native JSON type or a `VARCHAR/NVARCHAR(MAX)` column with an `ISJSON` (MSSQL) / `JSON_VALID` (MySQL) check. UUID PKs MUST be stored as `UNIQUEIDENTIFIER` (MSSQL) or `CHAR(36)` / `BINARY(16)` (MySQL). |
| C-2 | **Frontend untouched in Phase 0.** Next.js 16 App Router code at `fluxtrack/` MUST NOT change while the backend is being stood up. Phase 10 introduces a thin proxy that forwards `/apis/*` to `/api/v1/*` so the UI continues to work unmodified. |
| C-3 | **Repository layout.** The Django service MUST live at `fluxtrack_backend/` at the repository root, a sibling of `fluxtrack/`. No nesting. |
| C-4 | **Time zone.** All stored timestamps MUST be UTC-offset-aware. UI MUST render Asia/Manila local. The materialiser and monitors MUST anchor "today" to Manila local. |
| C-5 | **Email domain.** Production identities MUST originate from the MMCM tenant (`@mmcm.edu.ph`). |
| C-6 | **Append-only audit log.** `audit_log` rows MUST be insertable only; updates and deletes are forbidden by a trigger on the database and by the application's serializer. |
| C-7 | **Photo retention.** Session photos and HR exports MUST be deleted from storage after 30 days. |
| C-8 | **No vendor lock-in for queues.** Background jobs MUST use Celery with a Redis broker. No reliance on MSSQL Service Broker or MySQL Event Scheduler in business logic. |

### 2.6 Assumptions & dependencies

- The institution provides a managed MSSQL or MySQL instance reachable from the application host.
- A Redis instance (managed or self-hosted) is available with sub-millisecond latency from the Django host.
- Object storage (Azure Blob or S3) is provisioned with a private container/bucket named `session-photos`.
- Google OAuth client credentials for the MMCM tenant are available; alternatively, Microsoft Entra ID may be wired in a follow-up (D-12).
- The institution's network admits the application server's egress to the chosen storage backend over TLS 443.

---

## 3. External interfaces

### 3.1 User interface

- The existing Next.js UI is the sole human entry point. There are six role-scoped surfaces: `/faculty/*`, `/ifo/*`, `/checker/*`, `/guard/*`, `/hr/*`, `/admin/*`, plus `/auth/login`.
- Responsive breakpoints: mobile ≥ 375 px, tablet ≥ 768 px, desktop ≥ 1024 px.
- Tap targets MUST be ≥ 44 × 44 CSS pixels on all primary actions.
- The UI MUST support `prefers-reduced-motion` and avoid keyframe animations when set.
- Demo Mode UI is preserved: a top-bar role / account picker rotates the `fluxtrack_demo_role` and `fluxtrack_demo_user_id` cookies and reloads the page so all per-user data re-fetches.

### 3.2 Hardware interface

- Faculty F2F / Blended check-in requires a device camera (`MediaDevices.getUserMedia`). The application MUST gracefully degrade when permission is denied: the user is shown a clear error with a retry path. File-from-disk uploads are NOT permitted on the check-in flow (proof-of-presence intent).

### 3.3 Software interface

| Direction | Interface | Protocol | Notes |
| --- | --- | --- | --- |
| Frontend → Backend | Django REST API | HTTPS / JSON | OpenAPI 3 generated via `drf-spectacular`. |
| Frontend ↔ Backend (live data) | Django Channels | WSS | Auth via JWT in the query string at handshake. |
| Backend → Browser (push) | Web Push (VAPID) | HTTPS POST | `pywebpush` server-side. |
| Backend → Google OIDC | OpenID Connect | HTTPS | `django-allauth` Google provider. |
| Backend → Object storage | Vendor SDK (`django-storages`) | HTTPS | Azure Blob (prod) / S3 (alt prod) / local FS (dev). |
| Backend ↔ Database | TDS (MSSQL) or MySQL X | TCP | `mssql-django` or `mysqlclient` / `pymysql`. |
| Backend ↔ Redis | RESP3 | TCP | Channel layer + Celery broker. |

### 3.4 Communication interface

- All external HTTP traffic MUST go through TLS 1.2+.
- WebSocket connections MUST use `wss://` in production.
- HTTP cookies (`fluxtrack_demo_role`, `fluxtrack_demo_user_id`, Django session) MUST be `Secure`, `HttpOnly` where applicable, and `SameSite=Lax` (default) or `SameSite=None; Secure` for cross-origin scenarios.

---

## 4. Tech stack architecture

### 4.1 Frontend — Next.js

- **Version:** Next.js 16 App Router (React 19.2).
- **Location:** `fluxtrack/` (unchanged in Phase 0).
- **Responsibilities:** All UI; transient client state; demo-mode cookie handling; live calendar grid; check-in / check-out flow; WebSocket subscription to backend; Web Push registration; service worker.
- **Build artefact:** Server-rendered Node.js process (default) or static export behind a reverse proxy.

### 4.2 Backend — Django + DRF

- **Version:** Django 5.x with Django REST Framework, Django Channels, Celery, `django-allauth`, `djangorestframework-simplejwt`, `drf-spectacular`, `django-storages`, `pywebpush`.
- **Location:** `fluxtrack_backend/` (created in Phase 1).
- **Layout (logical):**
  - `apps/core` — base model, mixins, permission classes.
  - `apps/users` — `User` (custom `AbstractBaseUser`), `UserDevice`, `NotificationPreference`.
  - `apps/rooms`, `apps/academics`, `apps/schedules`, `apps/sessions`, `apps/attendance`, `apps/assists`, `apps/bookings`, `apps/payroll`, `apps/notifications`, `apps/audit`, `apps/system`.
  - `monitors/` — Celery beat task replacing each `pg_cron` job.
  - `realtime/` — Channels routing and consumers.
  - `scripts/` — one-shots (e.g. the Postgres → MSSQL ETL).
- **Process model:** Uvicorn workers under Gunicorn (ASGI required for Channels). Celery worker and celery-beat processes run alongside.

### 4.3 Database — MSSQL or MySQL

- **Choice criteria:**
  - MSSQL is preferred when the institution already operates SQL Server (licensing + DBA experience already in place).
  - MySQL 8+ is preferred when no SQL Server estate exists; Community Edition is free.
- **Common ground (vendor-portable):** `VARCHAR + CHECK` for ENUMs, JSON-validated string columns for JSONB-equivalent data, UUID PKs, named constraints, application-layer overlap checks reinforced by database triggers.
- **Driver matrix:**

  | Database | Driver | Django settings `ENGINE` |
  | --- | --- | --- |
  | MSSQL | `mssql-django` (pyodbc + ODBC Driver 18) | `mssql` |
  | MySQL | `mysqlclient` (preferred) or `PyMySQL` | `django.db.backends.mysql` |

- **Migration parity:** A single set of Django migrations describes the schema. Vendor-specific differences are isolated to:
  - JSON validation: `ISJSON(col) = 1` (MSSQL) vs `JSON_VALID(col) = 1` (MySQL).
  - UUID storage: `UNIQUEIDENTIFIER` (MSSQL) vs `CHAR(36)` or `BINARY(16) + UUID_TO_BIN/BIN_TO_UUID` (MySQL).
  - Datetimes: `DATETIMEOFFSET(3)` (MSSQL) vs `DATETIME(3)` + a paired `offset_minutes SMALLINT` column or `TIMESTAMP(3)` (UTC-only) in MySQL.
  - Boolean: `BIT` (MSSQL) vs `TINYINT(1)` (MySQL — Django ORM abstracts this).

### 4.4 Realtime — Django Channels + Redis

- **Mechanism:** Django signals on the five watched models (`Session`, `Notification`, `AssistRequest`, `ExtensionRequest`, `Dispute`) publish events to scope-keyed channel groups (e.g. `sessions:<faculty_id>`).
- **Wire format:** Preserves v6.0's payload shape — `{ eventType: 'INSERT'|'UPDATE'|'DELETE', new, old }` — so the frontend hook `use-realtime-channel.ts` is replaced one-for-one without consumer changes.
- **Auth:** JWT passed as a `?token=…` query parameter; a Channels middleware validates and rejects on signature / expiry failure.

### 4.5 Background jobs — Celery beat

The nine periodic jobs from v6.0 (`pg_cron`) are re-implemented as Celery beat tasks. Each MUST be **idempotent**, MUST log a row to the `monitor_runs` table on every run (`task_name`, `started_at`, `completed_at`, `affected_rows`, `error`), and MUST use the database's row-level locking primitive (`WITH (UPDLOCK, READPAST)` in MSSQL; `SELECT … FOR UPDATE SKIP LOCKED` in MySQL 8+) to avoid double-processing across concurrent workers.

### 4.6 Object storage — `django-storages`

- Single configuration knob: `STORAGE_BACKEND ∈ { 'azure', 's3', 'local' }`.
- Upload flow: client POSTs the photo as `multipart/form-data` to `/api/v1/photos/upload`. The server validates ownership, MIME type (`image/jpeg|png|webp`), and size (≤ 5 MB) before writing to the chosen backend.
- Read flow: `GET /api/v1/photos/{id}/signed-url` returns a 5-minute pre-signed URL (or a Django-served streaming response when backend is `local`).

### 4.7 Authentication

- **Live mode:** `django-allauth` Google OIDC → on first sign-in a `User` row is provisioned with `role='faculty'` (default; promoted by a System Admin). Simple JWT issues a 60-min access token + 14-day refresh token.
- **Demo mode:** Toggled by `DEMO_MODE=True` in Django settings. Middleware reads the `fluxtrack_demo_role` and `fluxtrack_demo_user_id` cookies set by the existing frontend, resolves the user, and attaches it to `request.user`. JWT issuance is skipped — the cookies *are* the identity.
- **Role enforcement:** DRF permission classes (`IsFaculty`, `IsIfoOrSystemAdmin`, etc.) + per-viewset `get_queryset()` filtering. RLS is dropped.

### 4.8 Deployment topology

```
                ┌────────────────────────────────────────────────┐
                │   Reverse proxy (Nginx / IIS, TLS terminated)  │
                └────────┬───────────────────────┬──────────────┘
                         │                       │
        ┌────────────────▼─────────┐  ┌──────────▼──────────────┐
        │  Next.js (Node, 2 repl.)  │  │ Uvicorn / Gunicorn       │
        │  fluxtrack/               │  │ Django + Channels (2 repl) │
        └───────────────────────────┘  └──────────┬──────────────┘
                                                   │
                              ┌────────────────────┼────────────────────┐
                              ▼                    ▼                    ▼
                       ┌────────────┐      ┌─────────────┐      ┌────────────────┐
                       │ Celery     │      │ MSSQL /     │      │ Redis          │
                       │ worker     │      │ MySQL       │      │ (broker + WS)  │
                       │ (2 repl.)  │      └─────────────┘      └────────────────┘
                       ├────────────┤
                       │ Celery beat│
                       │ (1 repl.)  │
                       └────────────┘
                              │
                              ▼
                       ┌────────────────┐
                       │ Object storage │
                       │ (Azure / S3)   │
                       └────────────────┘
```

---

## 5. Database specification

### 5.1 Common DDL principles

- **PKs:** `UUIDField(primary_key=True, default=uuid.uuid4, editable=False)` in the ORM. Stored as `UNIQUEIDENTIFIER` (MSSQL) or `CHAR(36)` / `BINARY(16)` (MySQL).
- **Foreign keys:** Always named `fk_<table>_<col>`.
- **CHECK constraints:** Always named `ck_<table>_<rule>`.
- **Indexes:** Always named `ix_<table>_<cols>`.
- **Defaults:** All datetime defaults use the vendor's UTC-aware "now" — `SYSDATETIMEOFFSET()` in MSSQL; `UTC_TIMESTAMP(3)` in MySQL. Django sets `default=django.utils.timezone.now` for application-side parity.

### 5.2 ENUM strategy

Twenty-one ENUMs from v6.0 are re-encoded as named CHECK constraints. The label strings are unchanged — `'active'`, `'completed'`, `'absent'` — so seed data round-trips without remapping.

Example (MSSQL & MySQL identical):

```sql
role VARCHAR(16) NOT NULL,
CONSTRAINT ck_users_role CHECK (role IN ('faculty','ifo_admin','checker','guard','hr_admin','system_admin'))
```

The full ENUM list is in Appendix A.

### 5.3 Postgres → MSSQL → MySQL type map

| Concept | Postgres (v6.0) | MSSQL (v7.0) | MySQL (v7.0) |
| --- | --- | --- | --- |
| UUID PK | `uuid` | `UNIQUEIDENTIFIER` | `CHAR(36)` (or `BINARY(16)`) |
| Timestamp w/ tz | `timestamptz` | `DATETIMEOFFSET(3)` | `DATETIME(3)` (+ `offset_minutes SMALLINT`) or UTC-only |
| Date | `date` | `DATE` | `DATE` |
| Time of day | `time` | `TIME(0)` | `TIME` |
| Boolean | `boolean` | `BIT` | `TINYINT(1)` (Django ORM abstracts) |
| Integer | `int` | `INT` | `INT` |
| Text | `text` | `NVARCHAR(MAX)` | `LONGTEXT` (or `TEXT` for ≤ 64 KB) |
| Fixed-length string | `bpchar(64)` | `CHAR(64)` | `CHAR(64)` |
| JSON document | `jsonb` | `NVARCHAR(MAX) + ISJSON(...) = 1` | `JSON` (native) or `LONGTEXT + JSON_VALID(...) = 1` |
| IP address | `inet` | `VARCHAR(45)` | `VARCHAR(45)` |
| Postgres ENUM | `mytype` | `VARCHAR(n) + CHECK (col IN (...))` | `VARCHAR(n) + CHECK (col IN (...))` |
| Range / interval | `tstzrange`, `interval` | dropped — replaced by paired columns + app-layer logic | dropped — same |

### 5.4 Exclusion-constraint replacement (vendor-portable)

Postgres v6.0 used two GIST exclusion constraints to enforce non-overlap:

1. `schedules.sched_no_section_overlap` — no two active schedules for the same section may overlap on the same day-of-week.
2. `payroll_periods.pp_no_overlap` — no two payroll periods may overlap on date ranges.

In v7.0 both checks are enforced **twice**:

1. **App layer** — Django model `clean()` runs the overlap query in a `pre_save` hook and raises `ValidationError`. DRF serializers surface this as a structured `400 Bad Request` so the UI shows a field-level error.
2. **Database layer** — `AFTER INSERT, UPDATE` triggers (`trg_schedules_no_section_overlap`, `trg_payroll_periods_no_overlap`) re-run the same query and `ROLLBACK TRANSACTION` on conflict. The triggers compile under both MSSQL T-SQL and MySQL procedural SQL with minor syntactic adjustments (covered in Phase 2 of [R-6](./07_MIGRATION_DJANGO_MSSQL.md)).

### 5.5 Trigger replacements for Postgres-only functions

| Postgres construct (v6.0) | v7.0 replacement |
| --- | --- |
| `tg_set_updated_at`, `touch_user_devices_updated_at` | App-side `pre_save` signal updates `updated_at`; DB trigger `trg_*_touch_updated_at` is a backstop. |
| `tg_emit_audit` | `core.audit.AuditMixin` queues an audit row in `transaction.on_commit`. |
| `tg_users_force_signout` | Django `post_save` signal stamps `User.signout_after`; JWT middleware honours it on every request. |
| `tg_block_locked_session_update` | `Session.save()` raises when parent `PayrollPeriod.lock_stage ∈ {'hard','archived'}`; database trigger backstop. |
| `tg_disputes_maintain_period_count` | `Dispute.save()` and `Dispute.delete()` recompute the count; DB trigger backstop. |
| `current_role()`, `is_role(...)` | DRF permission classes (`apps/core/permissions.py`). |
| `checker_floors_today()` | `apps.attendance.services.checker_floors_today(user, date)`. |
| `fn_move_schedule(...)` | `apps.schedules.services.move_schedule(...)`. |
| `fn_materialize_sessions(...)` | `monitors/materialize_sessions.py` Celery task. |
| `fn_monitor_*` (eight functions) | One Celery task each under `monitors/`. |

### 5.6 Migration approach

Data migration from the v6.0 Postgres instance is documented in [R-7](./migration-sql/01_mssql_schema.sql) and [R-8](./migration-sql/02_data_etl.md). The procedure ports cleanly to MySQL by substituting:

- `pyodbc` → `mysqlclient` in the Python ETL script.
- `UNIQUEIDENTIFIER` → `CHAR(36)` in the DDL.
- `ISJSON(...)` → `JSON_VALID(...)` (or use the native `JSON` type and let MySQL validate on insert).
- `DATETIMEOFFSET(3)` → `DATETIME(3) + offset column` or store UTC only.

A MySQL-flavoured DDL companion file (`migration-sql/01_mysql_schema.sql`) MAY be added in Phase 2 once the target vendor is finalised; the structural plan is otherwise unchanged.

---

## 6. Functional requirements (by role)

> All BR-* identifiers below are inherited verbatim from [R-2](./01_BUSINESS_RULES.md). They are reproduced here in summary form; the canonical wording lives in that document and remains authoritative.

### 6.1 Cross-cutting (BR-GEN)

| BR | Requirement |
| --- | --- |
| BR-GEN-1 | All stored timestamps UTC-aware; UI renders Asia/Manila. |
| BR-GEN-2 | Every state-changing action MUST emit an `audit_log` row. |
| BR-GEN-3 | RBAC is mandatory; every new model MUST ship a DRF permission class. (Replaces the v6.0 RLS rule.) |
| BR-GEN-4 | PII (email, name) visible to: self, IFO admin, HR admin, system admin. |
| BR-GEN-5 | `is_active = false` users cannot authenticate / receive notifications. |
| BR-GEN-6 | Role change forces immediate sign-out of all active JWT sessions. |
| BR-GEN-7 | File uploads in private containers; client only receives signed URLs (60 s TTL). |
| BR-GEN-8 | Demo Mode bypasses BR-GEN-3/4 only for the cookie-driven local development path and MUST be disabled in production (`DEMO_MODE=False`). |
| BR-GEN-9 | One `role` per user at a time. |
| BR-GEN-10 | 30-day retention for `session-photos` and HR exports — purged by `monitors/photo_cleanup.py` and `monitors/export_cleanup.py`. |

### 6.2 Faculty (BR-FAC)

Carried forward without behavioural change: schedule and session lifecycle (BR-FAC-1 .. BR-FAC-14), disputes (BR-FAC-15 .. BR-FAC-18), assists (BR-FAC-19, BR-FAC-20), and profile / device management (BR-FAC-21 .. BR-FAC-24). See [R-2](./01_BUSINESS_RULES.md) §"Faculty" for canonical text.

### 6.3 IFO Admin (BR-IFO)

Carried forward (BR-IFO-1 .. BR-IFO-27). Includes:

- Live room map (BR-IFO-1..3).
- Force-end (BR-IFO-4).
- Assist acknowledgement and escalation (BR-IFO-5, BR-IFO-6).
- Bookings and schedule import (BR-IFO-7..9).
- Dispute review with mandatory remedial-action (BR-IFO-10..12).
- Staff shift management (BR-IFO-13, BR-IFO-14).
- Class lifecycle: term spans, soft-remove, restore, move with split-schedule (BR-IFO-15..22).
- Sections catalogue (BR-IFO-23..25).
- Academic terms and breaks (BR-IFO-26, BR-IFO-27).

### 6.4 Checker (BR-CHK)

Floor-walk verification carried forward: verify / flag absent / could-not-access actions; floor scope drawn from today's `CheckerShift`.

### 6.5 Guard (BR-GRD)

Carried forward: floor view, assist acknowledgement, incident note + resolution status.

### 6.6 HR Admin (BR-HR)

Carried forward: payroll period lock-stage progression (`none → soft → hard → archived`), dispute SLA dashboards, CSV / PDF exports under `hr-exports` container with 30-day retention.

### 6.7 System Admin (BR-SYS)

Carried forward: user provisioning, role changes (BR-GEN-6 trigger), audit log read, `system_settings` mutation.

### 6.8 Notifications (BR-NOT)

Carried forward: in-app, Web Push, or both delivery channels; per-user per-event mute via `notification_preferences`; multi-device fan-out via `user_devices`.

### 6.9 New v7.0 application-layer requirements (APP-*)

| APP-# | Requirement |
| --- | --- |
| APP-1 | The Django backend MUST expose every legacy `/apis/*` endpoint at `/api/v1/*` with identical JSON contract (down to field names, types, and error envelopes). |
| APP-2 | An OpenAPI 3 document MUST be generated by `drf-spectacular` and published at `/api/v1/schema/` for frontend TypeScript regeneration. |
| APP-3 | Every Celery monitor task MUST log a row to `monitor_runs` on each invocation regardless of outcome. |
| APP-4 | The WebSocket payload shape (`{eventType, new, old}`) MUST be byte-identical to the Supabase Realtime payload v6.0 relied on. |
| APP-5 | Demo Mode MUST function on a deployment that has NEVER been authenticated against Google — i.e. the demo middleware MUST be independent of `django-allauth`. |
| APP-6 | The Django service MUST start successfully against either MSSQL or MySQL with no source changes — vendor selection is by environment variable + Django `ENGINE` setting only. |
| APP-7 | The frontend MUST continue to call `/apis/*` during Phase 10 and have those calls forwarded to `/api/v1/*` by a Next.js rewrite or a route-handler proxy. |

---

## 7. Non-functional requirements

| NFR-# | Requirement | Verification |
| --- | --- | --- |
| NFR-1 | **P50 API latency ≤ 200 ms** for `GET /api/v1/sessions?from=…&to=…` over a 7-day range with ≤ 500 rows. | Load test in staging. |
| NFR-2 | **P95 API latency ≤ 600 ms** for the same query under 50 RPS. | Same. |
| NFR-3 | **Photo upload ≤ 5 MB** with HTTP 413 rejection past the limit. | Unit test. |
| NFR-4 | **WebSocket delivery latency ≤ 2 s** from DB commit to client receipt at the 95th percentile. | Soak test. |
| NFR-5 | **Availability** — single-region target of **99.5 %** business-hours (Mon–Sat, 06:00–22:00 PHT). | SLO dashboard. |
| NFR-6 | **All requests authenticated** except `/api/v1/health` and Demo-Mode cookie path. | Permission-class unit tests cover every viewset. |
| NFR-7 | **Audit log immutability** — `audit_log` rows MUST NOT be updatable or deletable from the application. | DB trigger raises; integration test asserts. |
| NFR-8 | **Cross-vendor parity** — every integration test MUST pass against both MSSQL and MySQL targets. | CI matrix. |
| NFR-9 | **Time zone correctness** — server stores UTC-aware; the materialiser and "today" comparisons MUST use Asia/Manila local. | Date-rollover regression test (run at 23:30 PHT in a CI clock-skew fixture). |
| NFR-10 | **Replication time budget** — fresh dev environment up in ≤ 30 minutes (carried forward from v6.0 NFR-17). | Setup-from-clone exercise. |
| NFR-11 | **Mobile-first responsiveness** — every primary screen MUST be usable at 375 × 667 viewport. | Manual checklist + Playwright snapshot. |
| NFR-12 | **Accessibility** — WCAG 2.1 AA for color contrast and tap targets; `prefers-reduced-motion` honoured. | axe-core scan in CI. |
| NFR-13 | **Secrets** — VAPID private key, OAuth client secret, DB credentials MUST come from environment variables (or the host's secret manager); never committed. | Static scan. |
| NFR-14 | **Logging** — Django logs to stdout in JSON in production; sensitive fields (passwords, JWTs, push subscriptions) redacted. | Log format test. |
| NFR-15 | **Backup** — DB backed up at minimum nightly with a 30-day retention; restore drill quarterly. | Ops runbook. |
| NFR-16 | **Backwards-compatible API responses during Phase 10** — proxy path MUST NOT alter response shape between Next.js handler and Django response. | Contract test. |
| NFR-17 | **Telemetry** — every Celery monitor MUST emit metrics to a `monitor_runs` table; ops dashboard surfaces last-run / failure. | Dashboard exists. |
| NFR-18 | **Database portability** — schema, triggers, and indexes MUST work identically on MSSQL 2019+ and MySQL 8+, with vendor differences confined to the migration set's vendor-conditional branches. | Cross-vendor CI suite. |
| NFR-19 | **Internationalisation readiness** — UI text strings are externalised to a locale file; current default `en-PH`. Adding a second locale is a configuration change, not a code change. | Code review. |
| NFR-20 | **Concurrency** — two Django replicas + two Celery workers MUST process the workload without dead-lock or duplicate side-effect. Monitors MUST use `SELECT … FOR UPDATE SKIP LOCKED` (MySQL) / `WITH (UPDLOCK, READPAST)` (MSSQL). | Concurrency soak. |

---

## 8. External integrations

### 8.1 Google OAuth

- Provider: `django-allauth` Google OIDC.
- Scope: `openid email profile`.
- First sign-in provisions a `User` with `role='faculty'`, `is_active=True`. A System Admin promotes to other roles.
- Allowed email domain: `@mmcm.edu.ph`. All other emails MUST be rejected at the callback stage.

### 8.2 Microsoft Entra ID (deferred — D-12)

- Re-instated in a later phase. The Django backend's auth provider plug-point (`SOCIALACCOUNT_PROVIDERS`) accepts an Entra config without code change.

### 8.3 Web Push (VAPID)

- Library: `pywebpush`.
- Keypair: re-used from v6.0 (already in `.env.local`).
- Subscriptions persisted in `user_devices.push_subscription` (one row per device).
- Delivery: a Celery task fan-outs the payload to every active subscription for the recipient.

### 8.4 Object storage

- Default production: Azure Blob Storage, container `session-photos` (private). Dispute evidence uses the `disputes/` prefix.
- Alternative production: AWS S3, same container name, same prefix.
- Dev/local: `FileSystemStorage` at `fluxtrack_backend/media/`.

### 8.5 Time source

- The system uses the application server's UTC clock; NTP synchronisation MUST be configured on the host.

---

## 9. Operational requirements

### 9.1 Celery beat schedule (replaces `pg_cron`)

| Task | Cadence | Purpose |
| --- | --- | --- |
| `monitors.absence.run` | `*/5 * * * *` | Mark `scheduled` sessions `absent` after `late_grace_minutes`. |
| `monitors.overstay.run` | `*/5 * * * *` | Flag `active` sessions past `end_time + courtesy_window`. |
| `monitors.en_route_expiry.run` | `*/5 * * * *` | Expire `en_route` declarations whose hold elapsed. |
| `monitors.extension_timeout.run` | `*/5 * * * *` | Time out pending extension requests. |
| `monitors.assist_escalation.run` | `*/5 * * * *` | Escalate unacknowledged assists past `ifo_escalation_minutes`. |
| `monitors.handover_protection.run` | `*/5 * * * *` | Resolve room-handover conflicts past the protection window. |
| `monitors.payroll_lifecycle.run_soft` | `*/5 * * * *` | Progress `soft → hard` lock when expiry passes. |
| `monitors.payroll_lifecycle.run_archive` | `*/5 * * * *` | Archive periods past `archive_after_days`. |
| `monitors.materialize_sessions.run` | `0 17 * * *` (UTC) ≡ 01:00 PHT | Create the next 14 days of session rows. |
| `monitors.photo_cleanup.run` | `0 19 * * *` (UTC) ≡ 03:00 PHT | Purge expired session photos. |
| `monitors.export_cleanup.run` | `0 19 30 * *` (UTC) ≡ 03:30 PHT | Purge expired HR exports. |

### 9.2 Health endpoints

- `GET /api/v1/health` — process liveness; HTTP 200 with `{ "status": "ok", "db": "ok", "cache": "ok" }` or `503` with the failing component flagged.
- `GET /api/v1/health/deep` — additionally checks the Celery worker queue and Redis connectivity.

### 9.3 Logging

- Format: structured JSON to stdout in production; pretty text in development.
- Fields: `level`, `time`, `request_id`, `user_id`, `path`, `method`, `status_code`, `latency_ms`, plus event-specific keys.
- Redaction: `Authorization` header, `password`, `push_subscription.endpoint` masked.

### 9.4 Backup & recovery

- **Database:** nightly full backup; 7-day point-in-time recovery; weekly off-site copy. Restore drill quarterly.
- **Object storage:** vendor-managed redundancy (Azure / S3 default replication).
- **Configuration:** `.env` / secret-manager snapshots stored separately from the application VM.

### 9.5 Monitoring

- A `monitor_runs` table is the canonical source for Celery task health.
- Application errors stream to the institution's APM (any OpenTelemetry-compatible backend); the choice is a deployment decision, not a code change.

---

## 10. Migration & cut-over

This SRS does not duplicate the migration plan; it ratifies it.

- Phase plan: [R-6](./07_MIGRATION_DJANGO_MSSQL.md) §9.
- Postgres → MSSQL ETL: [R-8](./migration-sql/02_data_etl.md).
- Vendor-portable schema baseline: [R-7](./migration-sql/01_mssql_schema.sql) (MySQL companion to be produced in Phase 2 if MySQL is the target).

The cut-over is gated by every NFR-* and APP-* requirement above passing in staging with parallel-run data for at least one calendar week.

---

## 11. Acceptance criteria

The realignment is considered **complete** when all of the following are demonstrably true on a staging deployment configured against either MSSQL or MySQL:

1. **Functional parity** — every BR in [R-2](./01_BUSINESS_RULES.md) passes its existing test (manual or automated). Faculty can complete a full schedule → check-in → check-out → dispute lifecycle. IFO can move and restore schedules. HR can lock a payroll period and export a CSV. Checker / Guard floor walks behave identically to v6.0.
2. **API parity** — every endpoint listed in Appendix C responds with a body whose JSON shape matches the v6.0 contract on a curated test corpus of 50 requests per endpoint. Differences in field order are tolerated; differences in field name, type, or value are not.
3. **Realtime parity** — a faculty tap-in propagates to the IFO live calendar in under 2 s at P95. The frontend's existing `use-realtime-channel.ts` hook continues to function unchanged.
4. **Background jobs** — every monitor in §9.1 executes successfully for one calendar week with `monitor_runs` showing zero errors.
5. **Data parity** — for a frozen Postgres snapshot, the ETL produces a target database where:
   - `COUNT(*)` matches on every table.
   - Foreign-key orphan scan returns zero.
   - A 50-row sample per table round-trip-diffs to zero on every column.
6. **Operational readiness** — `/api/v1/health` is monitored externally; a backup has been restored from a fresh dump within the quarter.
7. **Demo Mode** — selecting any of the seeded demo users via the existing topbar re-renders every page (dashboards, calendars, KPI cards) with that user's data. No stale data lingers.
8. **Vendor portability** — the full integration test suite passes against both MSSQL and MySQL configurations in CI.

---

## 12. Risks & open items

| ID | Risk / item | Mitigation |
| --- | --- | --- |
| R-1 | `mssql-django` quirks around `JSONField` lookups and deferred FK constraints. | Pin driver version; ship a `tests/test_db_compat.py` matrix early. |
| R-2 | MySQL 8 timezone story is less rich than Postgres / MSSQL — no native `DATETIMEOFFSET` equivalent. | Persist UTC + a paired `offset_minutes` for cases that need the original offset; the materialiser uses Manila local explicitly. |
| R-3 | Realtime broadcast volume during peak campus hours. | Channel groups are scoped per faculty / building, not global. Redis handles the fan-out comfortably at the institution's user count. |
| R-4 | Celery worker crash leaves monitors idle. | Two replicas + celery-beat as singleton; deep-health endpoint pings the queue. |
| R-5 | Cross-origin cookie handling once the frontend talks directly to Django (post-Phase 10). | Same-origin proxy retained until cookies are reissued with `SameSite=None; Secure`. |
| R-6 | ETL type drift (JSONB shape, timestamptz edge cases). | Per-table round-trip diff on a sample before commit; script aborts on first mismatch. |
| R-7 | Loss of Postgres-managed `auth.users` FK. | Identity is now Django-managed; UUIDs preserved across the migration so external references resolve. |
| R-8 | Operational learning curve for institutions running MySQL but not MSSQL (or vice versa). | Both vendor profiles are tested in CI; `docs/` includes one quick-run per vendor. |
| D-11 | Realtime client subscriptions for the IFO live map (currently 8-s polling in v6.0). | Resolved by Phase 6 of [R-6](./07_MIGRATION_DJANGO_MSSQL.md). |
| D-12 | Microsoft Entra ID restoration. | Reactivated by adding a `SOCIALACCOUNT_PROVIDERS` entry; no code change required. |

---

## Appendix A — ENUM inventory

All 21 ENUMs from v6.0 are preserved verbatim and encoded as `VARCHAR(n) + CHECK (col IN (…))` on both MSSQL and MySQL.

| Enum | Allowed values |
| --- | --- |
| `user_role` | faculty, ifo_admin, checker, guard, hr_admin, system_admin |
| `session_status` | scheduled, pending, active, en_route, completed, early_end, absent, overstay, checker_flagged |
| `modality` | f2f, blended, online |
| `day_of_week` | mon, tue, wed, thu, fri, sat |
| `extension_status` | none, pending, approved, denied, timed_out, auto_approved |
| `booking_status` | active, cancelled |
| `employment_type` | full_time, part_time |
| `room_type` | lecture, lab, seminar, conference, other |
| `checker_action` | verified, flagged_absent, could_not_access |
| `cna_reason` | room_locked, restricted_access, room_not_found, other |
| `dispute_reason` | wlan_issue, camera_issue, schedule_error, checker_error, other |
| `dispute_status` | pending, approved, denied, escalated |
| `dispute_source` | faculty, hr_flag |
| `dispute_remedial_action` | restore_completed, mark_early_end, keep_status, manual_adjust |
| `delivery_via` | push, in_app, both |
| `export_format` | csv, pdf |
| `lock_stage` | none, soft, hard, archived |
| `en_route_reason` | current_class, traffic, commute, other |
| `en_route_status` | active, expired, cancelled, resolved |
| `checker_guard_role` | checker, guard |
| `guard_resolution` | resolved_onsite, referred_ifo, referred_external, no_issue, other |

---

## Appendix B — Table inventory

24 tables. PK / FK web matches v6.0; types translated per §5.3.

| # | Table | Role-scope (read-mostly) | Notes |
| --- | --- | --- | --- |
| 1 | `users` | self, IFO, HR, System Admin | Custom Django `AbstractBaseUser`. |
| 2 | `rooms` | everyone | Building × floor catalogue. |
| 3 | `academic_terms` | IFO, HR, System Admin | Drives session materialisation. |
| 4 | `academic_breaks` | IFO, HR, System Admin | Excluded dates per term. |
| 5 | `sections` | IFO, HR, System Admin | Section catalogue. |
| 6 | `schedules` | self + IFO/HR/System | Recurring weekly classes. |
| 7 | `schedule_moves` | IFO, HR, System Admin | Audit row per move. |
| 8 | `sessions` | self + IFO/HR/System | Core attendance record. |
| 9 | `en_route_declarations` | self + IFO | Late-arrival declarations. |
| 10 | `extension_requests` | self + IFO | One per session. |
| 11 | `disputes` | self + IFO/HR/System | One pending per session. |
| 12 | `room_handover_conflicts` | IFO | Tap-on-extended-room conflicts. |
| 13 | `assist_requests` | self + IFO + Guard | IFO + Guard escalation paths. |
| 14 | `manual_bookings` | IFO | Non-class room reservations. |
| 15 | `payroll_periods` | HR + System Admin | Lock-stage progression. |
| 16 | `hr_exports` | HR + System Admin | Audit trail of CSV / PDF exports. |
| 17 | `checker_shifts` | self + IFO + System Admin | Daily duty assignments. |
| 18 | `checker_shift_floors` | self + IFO + System Admin | Floors per shift. |
| 19 | `checker_validations` | self + IFO + System Admin | Per-session verification action. |
| 20 | `notifications` | self | In-app + push ledger. |
| 21 | `notification_preferences` | self | Per-event mute. |
| 22 | `user_devices` | self | Multi-device push subscriptions. |
| 23 | `system_settings` | everyone reads; System Admin writes | Runtime tunables. |
| 24 | `audit_log` | HR + System Admin read; everyone insert | Append-only. |

Plus the operational `monitor_runs` table introduced in v7.0 (see APP-3).

---

## Appendix C — API endpoint mapping

The frontend continues to call `/apis/*` during Phase 10; the Django service mirrors every endpoint at `/api/v1/*`. The two are kept byte-identical by the integration-test contract suite (NFR-16).

| Domain | Path (v7.0) | Method(s) |
| --- | --- | --- |
| Auth | `/api/v1/auth/google/login` | GET |
| Auth | `/api/v1/auth/google/callback` | GET |
| Auth | `/api/v1/auth/signout` | POST |
| Demo | `/api/v1/demo/users?role=…` | GET |
| Users | `/api/v1/users[/{id}]` | GET / POST / PATCH |
| Users | `/api/v1/users/me` | GET / PATCH |
| Devices | `/api/v1/users/me/devices[/{id}]` | GET / POST / PATCH / DELETE |
| Preferences | `/api/v1/users/me/preferences` | GET / PATCH |
| Rooms | `/api/v1/rooms[/{id}]`, `/api/v1/rooms/status` | GET / POST / PATCH |
| Schedules | `/api/v1/schedules[/{id}]`, `/{id}/archive`, `/{id}/move`, `/import` | GET / POST / PATCH |
| Sessions | `/api/v1/sessions[/{id}]`, `/{id}/start`, `/{id}/end`, `/{id}/extension`, `/{id}/en-route` | GET / POST / PATCH |
| Extensions | `/api/v1/extensions/{id}/{approve,deny}` | POST |
| Disputes | `/api/v1/disputes[/{id}]`, `/{id}/{approve,deny}` | GET / POST / PATCH |
| Assists | `/api/v1/assists[/{id}]`, `/{id}/acknowledge` | GET / POST / PATCH |
| Checker | `/api/v1/checker/shifts[/{id}]`, `/{id}/start`, `/{id}/end`, `/copy` | GET / POST / PATCH |
| Validations | `/api/v1/checker/validations` | POST |
| Bookings | `/api/v1/bookings[/{id}]` | GET / POST / PATCH |
| HR | `/api/v1/hr/summary`, `/records`, `/payroll[/{id}]`, `/payroll/{id}/finalize`, `/exports` | GET / POST |
| Photos | `/api/v1/photos/upload`, `/photos/{id}/signed-url` | POST / GET |
| Academic | `/api/v1/academic-terms[/{id}]`, `/academic-breaks[/{id}]`, `/sections[/{id}]`, `/sections/{id}/conflicts` | GET / POST / PATCH |
| WLAN | `/api/v1/wlan/check` | POST |
| Admin | `/api/v1/admin/users`, `/admin/audit`, `/admin/jobs`, `/admin/settings` | GET / POST / PATCH |
| Notifications | `/api/v1/notifications[/{id}/read]`, `/notifications/subscribe`, `/notifications/push` | GET / POST |
| Health | `/api/v1/health`, `/api/v1/health/deep` | GET |
| Schema | `/api/v1/schema/`, `/api/v1/schema/swagger-ui/` | GET |
| Realtime | `wss://<host>/ws/<table>?scope=…&token=…` | WS upgrade |

---

## Appendix D — Glossary

| Term | Definition |
| --- | --- |
| **Active session** | A `session` whose `status = 'active'` — faculty has tapped in and not yet tapped out. |
| **Auto-absent** | The state a `scheduled` session reaches after `late_grace_minutes` elapses without check-in. |
| **Check-in window** | `[scheduled_start − 10 min, scheduled_start + 15 min]` — when a faculty MAY tap in. |
| **Courtesy window** | `[scheduled_end, scheduled_end + courtesy_window_minutes]` — overrun allowed before `overstay`. |
| **Demo Mode** | `DEMO_MODE = True` in Django settings; identity by cookie, no real auth. |
| **En route hold** | Reservation kept on a room while a faculty is declared late. |
| **Floor scope** | The set of floors a checker is responsible for on a given day. |
| **Force-end** | IFO override that flips an `active` session to `completed`. |
| **Handover protection** | Time during which an extension keeps the room for the requesting faculty even if another class taps in. |
| **Materialise** | Generate per-day `session` rows from a recurring `schedule` for a future window. |
| **Soft lock** | Payroll period state where edits are reversible by HR; transitions to `hard` on expiry. |
| **Tap in / tap out** | Colloquial for check-in / check-out. |

---

*End of SRS v7.0 (Tech Stack Realignment).*
