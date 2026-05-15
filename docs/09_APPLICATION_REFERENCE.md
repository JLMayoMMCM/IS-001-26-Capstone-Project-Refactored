# FluxTrack — Application Reference (file-by-file)

> Companion to `02_FUNCTIONALITY.md` (which is keyed by **role**). This doc is keyed by **file**, covering: every API route under `fluxtrack/app/apis/`, the page tree under `fluxtrack/app/`, every client hook under `fluxtrack/hooks/`, and every shared module under `fluxtrack/lib/` and `fluxtrack/components/`.
>
> Stack: Next.js 16 App Router (React 19.2) + Supabase (Postgres 15, Auth, Realtime, Storage, Edge Functions) + Web Push/VAPID. See `fluxtrack/AGENTS.md` — this Next.js install has breaking changes from upstream; the file-system conventions here match the actual repo, not the public docs.

---

## 1. Top-level layout

```
fluxtrack/
├── app/                  # Next.js App Router — pages, layouts, route handlers
│   ├── layout.tsx        # Root layout: Geist fonts, html scaffold
│   ├── page.tsx          # "/" — redirects to role home or /auth/login
│   ├── auth/             # Login + OAuth client surface
│   ├── faculty/ ifo/ checker/ guard/ hr/ admin/   # Six role surfaces
│   └── apis/             # All HTTP endpoints (note plural — not /api)
├── hooks/                # Client-side React hooks (data + realtime)
├── lib/                  # Server- and client-shared library code
│   ├── api/              # Route helpers (respond, errors)
│   ├── auth/             # Session, role config, demo fallback
│   ├── supabase/         # Browser / SSR / service-role clients
│   ├── audit/            # auditLog() writer
│   ├── push/             # Web Push (VAPID) helpers
│   ├── utils/            # Pure helpers (date, modality, status)
│   ├── data/             # Static catalogs (rooms.generated.json)
│   └── utils.ts          # cn() classname helper (shadcn/ui)
└── components/
    ├── ui/               # shadcn/ui primitives (button, card, table, …)
    ├── layout/           # AppShell (sidebar, topbar)
    ├── topbar/           # LiveClock, NotificationBell
    ├── brand/            # Logo / Wordmark
    └── demo/             # DemoBanner, RoleSwitcher
```

Routing rule: every URL starting with `/<role>/` is a page; every URL starting with `/apis/` is an HTTP handler. The `app/` tree never mixes the two.

---

## 2. Pages — `fluxtrack/app/`

Each role has a `layout.tsx` wrapping its pages in [`<AppShell role="…" demoMode={…}>`](../fluxtrack/components/layout/app-shell.tsx) plus a [`<DemoBanner />`](../fluxtrack/components/demo/demo-banner.tsx). Role gating is enforced by [`lib/auth/config.ts:ROUTE_ROLE_MAP`](../fluxtrack/lib/auth/config.ts).

### Root

| File | Function |
|---|---|
| [app/layout.tsx](../fluxtrack/app/layout.tsx) | Root html shell, Geist Sans/Mono fonts, `<title>FluxTrack — MapuaMCM</title>`. |
| [app/page.tsx](../fluxtrack/app/page.tsx) | Server component: resolves current user, redirects to `roleHomePath(role)` or `/auth/login`. |

### Auth

| Path | File | Function |
|---|---|---|
| `/auth/login` | [auth/login/page.tsx](../fluxtrack/app/auth/login/page.tsx) + [login-client.tsx](../fluxtrack/app/auth/login/login-client.tsx) | Google OAuth button (live mode); demo-mode role picker. |
| layout | [auth/layout.tsx](../fluxtrack/app/auth/layout.tsx) | Plain centered shell — no AppShell, no sidebar. |

### Faculty (`/faculty/*`)

| Path | Purpose |
|---|---|
| `/faculty/dashboard` | Today's classes, active-session card, check-in CTA. |
| `/faculty/schedule` | Weekly recurring schedule grid; term toggle. |
| `/faculty/live-calendar` | Live timeline view of own sessions. |
| `/faculty/attendance` | Historical sessions table + dispute entry. |
| `/faculty/disputes` | Own-only dispute list. |
| `/faculty/settings/profile` | Edit profile + registered devices. |
| `/faculty/settings/preferences` | Push subscription toggle, notification categories. |

### IFO Admin (`/ifo/*`)

| Path | Purpose |
|---|---|
| `/ifo/ifo-dashboard` | Live room map (8s polling, 2-floor view). |
| `/ifo/ifo-live-calendar` | All sessions today across rooms. |
| `/ifo/ifo-faculty` + `/[id]` | Faculty roster + per-faculty drill-down. |
| `/ifo/ifo-rooms` | Room catalog management. |
| `/ifo/ifo-schedule` + `/[id]` | Schedule list / detail / edit. |
| `/ifo/ifo-schedule-move/[id]` | Move-schedule wizard (conflict pre-check). |
| `/ifo/ifo-bookings` | One-off manual room bookings. |
| `/ifo/ifo-disputes` | Approve/deny dispute queue. |
| `/ifo/ifo-assists` | Assist-request triage feed. |
| `/ifo/ifo-staff` | Checker/guard shift assignment. |
| `/ifo/ifo-sections` | Section CRUD per academic term. |
| `/ifo/ifo-academic-calendar` | Academic terms + breaks management. |

### Checker (`/checker/*`)

| Path | Purpose |
|---|---|
| `/checker/checker-dashboard` | Today's shift status; assigned floors. |
| `/checker/checker-checklist` | Per-room validation form (verified/flagged_absent/no_access). |
| `/checker/checker-assists` | Assist requests on assigned floor. |

### Guard (`/guard/*`)

| Path | Purpose |
|---|---|
| `/guard/guard-dashboard` | Active assist requests + shift status. |
| `/guard/guard-rooms` | Floor map view. |
| `/guard/guard-incidents` | Acknowledgement + incident note log. |
| `/guard/guard-notifications` | Push/in-app notifications feed. |

### HR (`/hr/*`)

| Path | Purpose |
|---|---|
| `/hr/hr-dashboard` | Compliance %, modality drift, no-show counts (from `/apis/hr/summary`). |
| `/hr/hr-records` | Paginated session records query (filters: date, status, dept, lock_stage). |
| `/hr/hr-payroll` | Payroll periods list + create + finalize (soft/hard lock). |
| `/hr/hr-exports` | CSV exports (signed URL, 60s TTL). |
| `/hr/hr-disputes` | HR-flagged disputes (BR-HR-2). |

### System Admin (`/admin/*`)

| Path | Purpose |
|---|---|
| `/admin/admin-users` | User CRUD + role assignment. System admin home. |
| `/admin/admin-settings` | `system_settings` editor, typed values. |
| `/admin/admin-audit` | Audit log search (filters: event, actor, target, time). |
| `/admin/admin-jobs` | `pg_cron` job list + manual trigger (materialize_sessions, photo_cleanup, export_cleanup). |

---

## 3. API routes — `fluxtrack/app/apis/`

All routes use the [`handle()` wrapper](../fluxtrack/lib/api/errors.ts) for typed `ApiError` → JSON conversion. Mutations call [`auditLog()`](../fluxtrack/lib/audit/log.ts). Auth/role gates use [`requireRole(...roles)`](../fluxtrack/lib/auth/get-session.ts) — `system_admin` is always allowed.

### Misc

#### `apis/test-connection`
- **GET** — health check; pings Supabase auth, returns project URL + server time.

### Auth

#### `apis/auth/google`
- **GET** — initiates Supabase Google OAuth; redirects to consent screen. **Disabled in demo mode.**

#### `apis/auth/callback`
- **GET** — OAuth callback. Exchanges `code` for session, looks up `users.role`, redirects to `roleHomePath(role)`.

#### `apis/auth/signout`
- **POST** — `auth.signOut()` and redirect to `/auth/login`.

### Users

#### `apis/users`
- **GET** — list users (admin only); filter by `role`, `is_active`.
- **POST** — provision new user via Supabase admin API; creates `auth.users` + `public.users` row + audit. Role gate: `system_admin`.

#### `apis/users/me`
- **GET** — current authenticated user profile (from `auth.getUser()` + `users` row).

#### `apis/users/me/preferences`
- **GET** — aggregated `notification_preferences`.
- **PUT** — bulk upsert by `event_type` (push/in_app booleans). Allowed event keys: `extension_request`, `dispute_updates`, `schedule_changes`, etc.

#### `apis/users/me/devices`
- **GET** — list active devices for current user.
- **POST** — add device; if `is_primary`, demotes existing primary first. Validates name (1–64), mac_hint (≤32), `device_type` enum.

#### `apis/users/me/devices/[id]`
- **PATCH** — update name, mac_hint, type, primary flag.
- **DELETE** — soft-deactivate (`is_active=false`). Ownership enforced.

#### `apis/users/[id]`
- **GET** — user detail (admin only).
- **POST** — patch user (role, profile, deactivation). Audit event type depends on `is_active` change. Role gate: `system_admin`.

### Sessions

#### `apis/sessions`
- **GET** — list sessions filtered by `date`, `range`, `status`, `faculty_id`. Faculty sees own only (RLS + post-query filter). Limit 500.

#### `apis/sessions/[id]`
- **GET** — single session with `schedules`, `users`, `rooms` joins.

#### `apis/sessions/[id]/start`
- **POST** — faculty starts session. Validates modality (photo for f2f/blended via `requiresPhoto`, Teams link for online via `requiresTeamsLink`), WLAN check, ownership. Transitions `pending → active`, sets `actual_start`. Logs modality override if changed.

#### `apis/sessions/[id]/en-route`
- **POST** — faculty declares "running late". Creates `en_route_declarations` row, sets `hold_expires_at = scheduled_start + eta + EN_ROUTE_GRACE_MIN` (10m grace), session status → `en_route`. ETA must be 5–60 min.

#### `apis/sessions/[id]/extension`
- **POST** — request session extension (BR-3). Auto-approved if no incoming session in same room (max 30m). Pending if incoming session exists (max 20m, 3-min response deadline).

#### `apis/sessions/[id]/end`
- **POST** — end session (faculty) or force-end (IFO with `force=true`). Computes duration → `completed` (≥40m), `early_end` (<40m), `overstay` (if already flagged). IFO-only path stamps `force_ended_by`, `force_end_reason`.

### Photos

#### `apis/photos/upload`
- **POST** — multipart upload to `session-photos` bucket. Accepts jpeg/png/webp ≤5MB. Returns storage path for the caller (start endpoint stores it on the session). Ownership + non-terminal state required.

#### `apis/photos/[id]/signed-url`
- **GET** — 60-second signed URL for a session photo. Authorized for: faculty owner, IFO/HR/system_admin, or checker assigned to same floor today (joins `checker_shift_floors`).

### Rooms

#### `apis/rooms`
- **GET** — all active rooms ordered by floor, room_code.

#### `apis/rooms/[id]`
- **GET** — room detail + today's occupants (active/overstay/en_route/pending).
- **PATCH** — update room fields. Role gate: `ifo_admin`.

#### `apis/rooms/status`
- **GET** — IFO Live Map polling endpoint (NFR-02: 8s, p95 <500ms). Returns active rooms with priority-ranked status: `booking > session > en_route > available`. Four parallel queries; `cache: no-store`.

### Bookings (manual ad-hoc room reservations)

#### `apis/bookings`
- **GET** — active manual bookings (IFO only).
- **POST** — create booking; conflict-detects against `manual_bookings` and `sessions` in same room/time.

#### `apis/bookings/[id]`
- **GET** — booking detail.
- **POST** — cancel booking; requires `reason` ≥3 chars. Active bookings only.

### Disputes

#### `apis/disputes`
- **GET** — list disputes (faculty sees own via RLS + defensive filter).
- **POST** — file dispute on session. `source: faculty | hr_flag`. Deadline = `actual_end + 72h`. Explanation ≥50 chars.

#### `apis/disputes/[id]`
- **GET** — single dispute with session, room, faculty, reviewer joins.

#### `apis/disputes/[id]/approve`
- **POST** — IFO approves. Requires `remedial_action` (`restore_completed | mark_early_end | keep_status | manual_adjust`) and `decision_note` ≥20 chars. May amend session status. Pending only.

#### `apis/disputes/[id]/deny`
- **POST** — IFO denies. Requires `decision_note` ≥20 chars. Pending only.

### Extensions

#### `apis/extensions/[id]/approve`
- **POST** — incoming faculty or IFO approves. Deadline must not have passed.

#### `apis/extensions/[id]/deny`
- **POST** — incoming faculty or IFO denies. Opens courtesy window on requesting session (BR-3.04: sets `courtesy_window_start`).

### Schedules

#### `apis/schedules`
- **GET** — list schedules (faculty sees own; admins see all). Filters: `day=today` (returns dow schedules), `include_archived` (admin only).

#### `apis/schedules/[id]`
- **GET** — schedule detail.
- **POST** — patch fields. Role gate: `ifo_admin`.

#### `apis/schedules/import`
- **POST** — bulk CSV import (multipart or JSON `{csv}`). Validates headers, room codes, faculty emails, time order, modality, day_of_week. Returns per-row error report for rejects.

#### `apis/schedules/[id]/archive`
- **POST** — soft-archive (`is_active=false`) with reason ≥20 chars. Deletes future `scheduled` sessions. `?restore=1` restores after slot-conflict check.

#### `apis/schedules/[id]/move`
- **POST** — moves schedule to new slot from `effective_from` (future date). Pre-checks room + section conflicts. Calls `fn_move_schedule` RPC (atomic split + repoint + notify). Supports `dry_run`.

### Sections

#### `apis/sections`
- **GET** — list sections, optional `term_id` filter.
- **POST** — create section. Unique `section_code` per term.

#### `apis/sections/[id]`
- **GET** — section detail.
- **PATCH** — update fields (program, year_level, student_count, is_active).
- **DELETE** — soft (`is_active=false`) if any schedules reference it; hard otherwise.

#### `apis/sections/[id]/conflicts`
- **GET** — return active schedules colliding with hypothetical `day/start/end` slot. Used by move/create wizards.

### Checker

#### `apis/checker/shifts`
- **GET** — list shifts (checker/guard see own; admins see all).
- **POST** — assign shift with floors (upsert on `user_id + shift_date`). `floors` array required.

#### `apis/checker/shifts/[id]/start`
- **POST** — checker/guard taps "Start Shift"; sets `actual_start`. Ownership + not-already-started.

#### `apis/checker/shifts/[id]/end`
- **POST** — end shift; sets `actual_end`. Audit payload includes `rooms_validated`, `rooms_skipped`.

#### `apis/checker/shifts/copy`
- **POST** — duplicate shifts + floors from `from_date` to `to_date`. Skips already-assigned users on `to_date`. Returns `{copied, skipped}`.

#### `apis/checker/validations`
- **GET** — list validations (optional `session_id` filter).
- **POST** — record validation (`verified | flagged_absent | could_not_access`). Side effects per BR-4: status → `checker_flagged`, increments shift counters.

### Assists

#### `apis/assists`
- **GET** — recent 100 assist requests with room+faculty joins.
- **POST** — faculty sends assist request (`room_id`, `assist_types` array, optional `note`).

#### `apis/assists/[id]/acknowledge`
- **POST** — IFO, guard, or checker acknowledges. IFO path → `ifo_acknowledged_*`. Floor-staff path → `guard_acknowledged_*` plus optional incident log + resolution status.

### Notifications

#### `apis/notifications`
- **GET** — paginated in-app feed for current user. Optional `unread=true`. Limit ≤200, ordered `created_at DESC`.

#### `apis/notifications/[id]/read`
- **POST** — mark as read (sets `read_at`). Recipient ownership enforced.

#### `apis/notifications/subscribe`
- **POST** — store push subscription (`PushSubscription` JSON) on `users.push_subscription`. One per user — re-subscribing overwrites.
- **DELETE** — remove subscription (logout).

#### `apis/notifications/push`
- **POST** — **internal only** (`x-internal-secret` header). Sends Web Push and optionally creates in-app rows. Cleans expired subscriptions.

### HR

#### `apis/hr/payroll`
- **GET** — list payroll periods.
- **POST** — create period; auto-attaches sessions in date range, sets `record_count`. Role gate: `hr_admin`.

#### `apis/hr/payroll/[id]`
- **GET** — period detail + status breakdown + open dispute count for that period.

#### `apis/hr/payroll/[id]/finalize`
- **POST** — soft-lock (48h window, BR-5) or hard-lock. Hard-lock requires soft first and blocks on open disputes.

#### `apis/hr/exports`
- **GET** — list previous exports.
- **POST** — generate CSV from `hr_session_records` view, upload to `hr-exports` bucket, auto-soft-lock period, return 60s signed URL. RFC 4180 escaping.

#### `apis/hr/records`
- **GET** — paginated `hr_session_records` query. Filters: date, status, dept, lock_stage, faculty name/email (ilike). Limit ≤500. Role gate: `hr_admin | system_admin | ifo_admin`.

#### `apis/hr/summary`
- **GET** — dashboard aggregates: `total_hours`, `modality_drift%`, `no_show_count`, `compliance%`, breakdowns by modality + status, `daily_hours` (last 7 days). Computes only on completed sessions; `no_show = absent + checker_flagged`.

#### `apis/hr/disputes/flag`
- **POST** — HR raises system-side dispute on a session (BR-HR-2). Stamps `hr_flag_*` fields, creates dispute (`source=hr_flag`). Rejects if a pending dispute already exists. `deadline_days` default 14, max 30.

### WLAN

#### `apis/wlan/check`
- **GET** — IP allowlist check (ADR-002). Reads `MCM_WIFI_CIDRS` env (comma-separated CIDRs), matches client IP from `x-forwarded-for` / `x-real-ip`. Returns `{on_campus, source}`.

### Academic

#### `apis/academic-terms`
- **GET** — list terms.
- **POST** — create term. Unique `code`, validates `term_end_date >= term_start_date`. Role gate: `ifo_admin`.

#### `apis/academic-breaks`
- **GET** — active breaks (optional `term_id`).
- **POST** — create break inside a term. Validates `date_to >= date_from`. Role gate: `ifo_admin`.

### Admin

#### `apis/admin/settings`
- **GET** — list `system_settings`.
- **PATCH** — bulk update with per-`value_type` validation (integer/boolean/string/enum/minutes/hours). Role gate: `system_admin`.

#### `apis/admin/audit`
- **GET** — audit log query. Filters: event, actor, target_type, time range. Joins actor user. Limit ≤500. Role gate: `system_admin | hr_admin`.

#### `apis/admin/jobs`
- **GET** — list `cron.job` rows (requires `pg_cron` + service-role SELECT grant). Returns 200 with empty list + hint if schema not accessible.

#### `apis/admin/jobs/run`
- **POST** — ad-hoc job trigger (BR-SYS-5). Supports `materialize_sessions` (RPC), `photo_cleanup`, `export_cleanup` (Edge Function calls via service-role auth).

### Demo

#### `apis/demo/users`
- **GET** — seeded users by role for the topbar account-switcher. **404 outside demo mode.**

---

## 4. Hooks — `fluxtrack/hooks/`

All client-side (`"use client"`). Each hook owns one slice of live data fetched from `/apis/*`, with realtime subscription via [`useRealtimeChannel`](../fluxtrack/hooks/use-realtime-channel.ts) and/or interval polling.

| Hook | Backed by | What it returns | Refresh strategy |
|---|---|---|---|
| [use-room-polling.ts](../fluxtrack/hooks/use-room-polling.ts) | `GET /apis/rooms/status` | `{ rooms, loading, error, lastUpdatedMs }` | 8s `setInterval` (NFR-02). Optional `floorFilter`. |
| [use-active-session.ts](../fluxtrack/hooks/use-active-session.ts) | `GET /apis/sessions?scope=mine&active=1` | `{ session, loading, error, refresh }` | Realtime on `sessions` table. |
| [use-notifications.ts](../fluxtrack/hooks/use-notifications.ts) | `GET /apis/notifications`, `POST /apis/notifications/[id]/read` | `{ items, unread, unreadCount, loading, error, refresh, markRead }` | Realtime on `notifications`. Optimistic mark-read. |
| [use-assist-feed.ts](../fluxtrack/hooks/use-assist-feed.ts) | `GET /apis/assists?scope=…` | `{ items, loading, error, refresh }` | Realtime on `assist_requests`. Scopes: `all | mine | floor`. |
| [use-realtime-channel.ts](../fluxtrack/hooks/use-realtime-channel.ts) | Supabase Realtime `postgres_changes` | (subscription side-effect) | Generic subscriber. Supports table union `sessions | notifications | assist_requests | extension_requests | disputes`, optional filter, `INSERT|UPDATE|DELETE|*`. Defensive: skips silently if Supabase env missing rather than crashing host component. |
| [use-mobile.ts](../fluxtrack/hooks/use-mobile.ts) | `window.matchMedia` | `boolean` (`isMobile`) | `MOBILE_BREAKPOINT = 768`. Updates on resize. |

Pattern note: every data hook uses the same shape — `useState` for value/loading/error, `useCallback` `refresh()`, `useEffect` initial fetch, `useRealtimeChannel(table, refresh)` to invalidate on writes. Add new hooks by copying any of the four feed hooks and swapping the URL + table name.

---

## 5. Library — `fluxtrack/lib/`

### `lib/api/` — route helpers

| File | Exports | Use |
|---|---|---|
| [api/respond.ts](../fluxtrack/lib/api/respond.ts) | `ok`, `err`, `notFound`, `badRequest`, `unprocessable`, `conflict`, `forbidden`, `unauthorized`, `handle` | Legacy plain-JSON response helpers. |
| [api/errors.ts](../fluxtrack/lib/api/errors.ts) | `ApiError`, `ApiErrorCode` (45+ typed codes), `handle(fn)` route wrapper | **Preferred path.** `throw new ApiError("EXTENSION_OVER_CAP", "...", {...})` → caught by wrapper → JSON `{ error: { code, message, details } }` with the right HTTP status from `STATUS_FOR`. Codes encode domain rules (`SESSION_NOT_OWNED`, `PAYROLL_LOCKED`, `EXTENSION_WINDOW_CLOSED`, …). |

### `lib/auth/` — identity & RBAC

| File | Function |
|---|---|
| [auth/config.ts](../fluxtrack/lib/auth/config.ts) | `Role` union, `ROLES`, `ROLE_HOME_PATH`, `roleHomePath()` (callable + indexable), `ROUTE_ROLE_MAP`, `rolesForPath()`, `ROLE_LABEL`, `ROLE_ACCENT`, `isDemoMode()`. Central truth for RBAC. |
| [auth/types.ts](../fluxtrack/lib/auth/types.ts) | `CurrentUser` shape used by all server code. |
| [auth/server.ts](../fluxtrack/lib/auth/server.ts) | `getCurrentUser()` — demo mode reads `fluxtrack_demo_role` + `fluxtrack_demo_user_id` cookies and looks up via service client; live mode reads Supabase Auth session. `requireRole(...roles)` throws `Response` 401/403. |
| [auth/get-session.ts](../fluxtrack/lib/auth/get-session.ts) | Newer wrapper that throws `ApiError` instead of `Response`. **Use this in API routes** so the `handle()` wrapper can format the error. `system_admin` always passes. |
| [auth/nav.tsx](../fluxtrack/lib/auth/nav.tsx) | `ROLE_NAV` — sidebar entries per role (label + icon + href). Inline SVG icons. Single source of truth for sidebar contents. |
| [auth/demo-data.ts](../fluxtrack/lib/auth/demo-data.ts) | `fallbackDemoUser(role)` — hard-coded `CurrentUser` per role used only when no DB user exists for the demo role. Throws outside demo mode. |

### `lib/supabase/` — DB clients

| File | Function |
|---|---|
| [supabase/types.ts](../fluxtrack/lib/supabase/types.ts) | `Database` type generated from Postgres schema. Imported by every Supabase client. |
| [supabase/config.ts](../fluxtrack/lib/supabase/config.ts) | `supabaseConfig()` — resolves URL + keys from env. Two-project layout: `*_DEMO_*` vs `*_LIVE_*` with legacy `NEXT_PUBLIC_SUPABASE_*` fallback. Reads at module top-level so the bundler can inline `NEXT_PUBLIC_*`. Service-role key skipped in browser. |
| [supabase/client.ts](../fluxtrack/lib/supabase/client.ts) | `createClient()` — browser client (`@supabase/ssr` `createBrowserClient`). Used by hooks. |
| [supabase/server.ts](../fluxtrack/lib/supabase/server.ts) | `createClient()` — SSR client with cookie pass-through. **In demo mode short-circuits to the service client** (otherwise `auth.uid()` would be NULL and every RLS-gated table would return zero rows). |
| [supabase/service.ts](../fluxtrack/lib/supabase/service.ts) | `createServiceClient()` — service-role (bypasses RLS). Server-only. Never import from a `"use client"` file. |
| [supabase/admin.ts](../fluxtrack/lib/supabase/admin.ts) | Re-exports `createServiceClient` as `createAdminClient` for back-compat call sites. |

### `lib/audit/log.ts`

`auditLog({ event_type, actor_id, target_type, target_id, payload, ip_address })` — fire-and-forget insert into `audit_log` via service client. **Never throws**, only logs on failure (audit must not break the calling action). `getClientIp(req)` / `getClientIpFromHeaders()` extract `x-forwarded-for` / `x-real-ip`.

### `lib/push/vapid.ts`

| Export | Function |
|---|---|
| `WebPushSubscription`, `PushPayload` | Types matching the W3C `PushSubscription` shape. |
| `isValidSubscription(input)` | Type guard for incoming subscribe POSTs. |
| `sendPush(sub, payload)` | POSTs to `${SUPABASE_URL}/functions/v1/push-send` with `INTERNAL_PUSH_SECRET`. Returns `{ ok, status, expired }` — `expired=true` on 404/410 so the caller can prune dead subscriptions. Logs and skips if env not set. |

### `lib/utils/`

| File | Exports |
|---|---|
| [utils/date.ts](../fluxtrack/lib/utils/date.ts) | `nowUtc()`, `addMinutesIso()`, `combineDateTime()` (treats input as Manila UTC+8), `todayLocal()`, `dayOfWeekKey()` returning `sun..sat`. UTC-first with Manila helpers for day-keyed work. |
| [utils/modality.ts](../fluxtrack/lib/utils/modality.ts) | `Modality` union, `requiresPhoto()`, `requiresTeamsLink()`, `isValidTeamsLink()` (matches `https://teams.microsoft.com/`), `hashTeamsLink()` (SHA-256 hex). |
| [utils/session-status.ts](../fluxtrack/lib/utils/session-status.ts) | Tunable constants (`CHECKIN_WINDOW_BEFORE_MIN`, `EN_ROUTE_GRACE_MIN`, `EARLY_END_THRESHOLD_MIN`, `COURTESY_WINDOW_MIN`, `EXTENSION_WINDOW_MIN`, `EXT_MAX_NO_INCOMING`, `EXT_MAX_WITH_INCOMING`) and predicates `canStart`, `canEnd`, `canDeclareEnRoute`, `canRequestExtension`. **Should ultimately come from `system_settings`.** |

### `lib/data/`

| File | Function |
|---|---|
| [data/rooms.generated.json](../fluxtrack/lib/data/rooms.generated.json) | Parsed from `replication/format/2T-25-26-Rooms.xlsx`. Static catalog. |
| [data/rooms.ts](../fluxtrack/lib/data/rooms.ts) | `ROOMS`, `RoomRecord`, `RoomBuilding`, `getBuildings()`, `roomsByBuilding()`. Bucketing rule: `A*`→Admin, `R*`→Education, `GYM*`/`P*`→Gymnasium, `V*`→Virtual, else→Other. |

### `lib/utils.ts`

`cn(...inputs)` — shadcn/ui standard `clsx + twMerge` classname helper.

---

## 6. Components — `fluxtrack/components/`

### `components/layout/`

[app-shell.tsx](../fluxtrack/components/layout/app-shell.tsx) — global chrome. Sidebar (collapsible, persisted via `fluxtrack_sidebar_collapsed` localStorage key) + topbar (LiveClock, NotificationBell, demo role switcher). Receives `role` and `demoMode` as props (server-resolved) to avoid the build-time inlining trap with `NEXT_PUBLIC_*`.

### `components/topbar/`

| File | Function |
|---|---|
| [topbar/live-clock.tsx](../fluxtrack/components/topbar/live-clock.tsx) | Manila-time clock in topbar (1s tick). |
| [topbar/notification-bell.tsx](../fluxtrack/components/topbar/notification-bell.tsx) | Bell icon + unread badge. Uses `useNotifications()`. |

### `components/brand/`

[brand/logo.tsx](../fluxtrack/components/brand/logo.tsx) — `<Logo />` and `<Wordmark />`. The MMCM × ASU horizontal mark lives at [public/brand/MMCM_X_ASU_LOGO_Full-horizontal.png](../fluxtrack/public/brand/MMCM_X_ASU_LOGO_Full-horizontal.png).

### `components/demo/`

| File | Function |
|---|---|
| [demo/demo-banner.tsx](../fluxtrack/components/demo/demo-banner.tsx) | Yellow banner shown in role layouts when `isDemoMode()`. |
| [demo/role-switcher.tsx](../fluxtrack/components/demo/role-switcher.tsx) | Topbar dropdown (demo only) — sets `fluxtrack_demo_role` / `fluxtrack_demo_user_id` cookies and reloads. Backed by `GET /apis/demo/users`. |

### `components/ui/`

shadcn/ui primitives — unmodified per shadcn convention. Includes: `button`, `button-group`, `kebab-menu`, `card`, `input`, `input-otp`, `input-group`, `label`, `field`, `textarea`, `select`, `native-select`, `combobox`, `command`, `checkbox`, `radio-group`, `switch`, `toggle`, `toggle-group`, `slider`, `progress`, `spinner`, `skeleton`, `badge`, `alert`, `alert-dialog`, `dialog`, `drawer`, `sheet`, `popover`, `hover-card`, `tooltip`, `dropdown-menu`, `context-menu`, `menubar`, `navigation-menu`, `tabs`, `accordion`, `collapsible`, `breadcrumb`, `pagination`, `table`, `chart`, `calendar`, `carousel`, `avatar`, `separator`, `aspect-ratio`, `scroll-area`, `resizable`, `kbd`, `item`, `empty`, `empty-state`, `sidebar`, `sonner` (toaster), `direction`.

---

## 7. End-to-end request flow

A typical authenticated request looks like:

```
Browser (page.tsx + hook)
   │   fetch("/apis/sessions/<id>/start", { method: POST, body })
   ▼
app/apis/sessions/[id]/start/route.ts
   │   handle(async (req) => {
   │     const user = await requireRole("faculty");          // lib/auth/get-session
   │     const sb   = await createClient();                  // lib/supabase/server
   │     // … modality / WLAN / ownership checks via lib/utils/* …
   │     await sb.from("sessions").update(...).eq("id", id);
   │     await auditLog({ event_type: "session.start", … }); // lib/audit/log
   │     return ok({ session });
   │   })
   ▼
Postgres (Supabase) — RLS enforced unless service client (demo mode)
   │
   ▼
Realtime broadcast on `sessions` table
   │
   ▼
Browser hook useActiveSession → useRealtimeChannel triggers refresh()
```

Errors thrown inside the handler as `ApiError` are caught by `handle()` and serialized to `{ error: { code, message, details } }` with the HTTP status from `STATUS_FOR` in [api/errors.ts](../fluxtrack/lib/api/errors.ts).

---

## 8. Conventions cheat sheet

- **Routes live under `app/apis/`, not `app/api/`.** Plural `apis` is the project convention.
- **`requireRole()` from `lib/auth/get-session.ts`** in API routes; it throws `ApiError` so the `handle()` wrapper can format. The older `requireRole` from `lib/auth/server.ts` throws raw `Response` objects and is used only in server components.
- **`system_admin` always passes** any role check — implemented inside both `requireRole` helpers. Don't add it to every `requireRole(...)` call.
- **Demo mode (`NEXT_PUBLIC_DEMO_MODE=true`)** swaps Supabase project, replaces auth with cookie-pinned identity, and short-circuits the SSR client to service-role. RLS is fully bypassed; route handlers must apply their own per-row filters where needed.
- **All mutations call `auditLog()`** with a descriptive `event_type`. Audit failures never break the action.
- **`ApiError` codes are typed.** Add new business-rule failures to the `ApiErrorCode` union and `STATUS_FOR` map in [api/errors.ts](../fluxtrack/lib/api/errors.ts) — don't invent ad-hoc strings.
- **Realtime invalidation > polling.** Use `useRealtimeChannel(table, refresh)` first; fall back to polling only for the IFO Live Map (NFR-02 mandates 8s).
- **Manila time helpers** in [utils/date.ts](../fluxtrack/lib/utils/date.ts) — never construct local-time dates manually; the campus is fixed UTC+8 with no DST.
