# FluxTrack — Implementation Status

> Snapshot of what was built in the "Implement Plans" pass. Read alongside [`03_IMPLEMENTATION_PLAN.md`](03_IMPLEMENTATION_PLAN.md).

---

## 1. What ships now

### Application code (`fluxtrack/`)

| Area | Files | Notes |
|---|---|---|
| Auth + roles | [lib/auth/config.ts](../fluxtrack/lib/auth/config.ts), [lib/auth/server.ts](../fluxtrack/lib/auth/server.ts), [lib/auth/get-session.ts](../fluxtrack/lib/auth/get-session.ts) | Demo-mode cookie + production Supabase Auth path. `requireRole(...)` enforces RBAC in route handlers. |
| Supabase clients | [lib/supabase/{client,server,service,admin,types}.ts](../fluxtrack/lib/supabase/) | Browser + SSR + service-role; full hand-written `Database` type covering 24 tables incl. the new sections/terms/breaks/moves. |
| Route middleware | [proxy.ts](../fluxtrack/proxy.ts) | Next.js 16 `proxy.ts` — public path allowlist, demo-mode cookie check, role-scoped path guard. |
| Root page | [app/page.tsx](../fluxtrack/app/page.tsx) | Role-aware redirect. |
| Login | [app/auth/login/page.tsx](../fluxtrack/app/auth/login/page.tsx) | Demo role-picker grid; Google OAuth branch for production. |
| Top-bar + shells | [components/layout/](../fluxtrack/components/layout/) | `RoleTopBar`, `SidebarShell`, `BrandSidebar`, `BrandLogo` — all role-aware. |
| Common UI | [components/ui/empty-state.tsx](../fluxtrack/components/ui/empty-state.tsx), [components/ui/kebab-menu.tsx](../fluxtrack/components/ui/kebab-menu.tsx) | Used across faculty/IFO/HR pages. |
| Demo banner / switcher | [components/demo/](../fluxtrack/components/demo/) | Top-bar accents + admin layout banner. |
| Hooks | [hooks/](../fluxtrack/hooks/) | `useRoomPolling` (8 s), `useRealtimeChannel`, `useActiveSession`, `useAssistFeed`, `useNotifications`, `useIsMobile`. |
| API plumbing | [lib/api/errors.ts](../fluxtrack/lib/api/errors.ts), [lib/audit/log.ts](../fluxtrack/lib/audit/log.ts), [lib/utils/{date,modality,session-status}.ts](../fluxtrack/lib/utils/), [lib/push/vapid.ts](../fluxtrack/lib/push/vapid.ts) | `ApiError` taxonomy with 30+ codes, `handle()` HOF, audit-log writer, modality/session helpers, push fan-out stub. |
| **New** class-lifecycle routes | [app/apis/schedules/[id]/archive/route.ts](../fluxtrack/app/apis/schedules/%5Bid%5D/archive/route.ts), [app/apis/schedules/[id]/move/route.ts](../fluxtrack/app/apis/schedules/%5Bid%5D/move/route.ts) | Soft archive + restore (BR-IFO-17..19); split-schedule move with `dry_run` conflict pre-check (BR-IFO-20..22). |
| **New** catalog routes | [app/apis/sections/](../fluxtrack/app/apis/sections/), [app/apis/academic-terms/route.ts](../fluxtrack/app/apis/academic-terms/route.ts), [app/apis/academic-breaks/route.ts](../fluxtrack/app/apis/academic-breaks/route.ts) | CRUD + section-conflict lookup. |
| **New** IFO pages | [app/ifo/ifo-sections/page.tsx](../fluxtrack/app/ifo/ifo-sections/page.tsx), [app/ifo/ifo-academic-calendar/page.tsx](../fluxtrack/app/ifo/ifo-academic-calendar/page.tsx) | Section catalog management; term + break editor. Linked from the IFO top-bar. |
| Pre-existing routes/pages | `app/apis/**`, `app/{faculty,ifo,checker,guard,hr,admin}/**` | Were skeleton-only; now compile against the lib/UI/hooks layer above. |

### TypeScript

- `npx tsc --noEmit` → **0 errors** at HEAD.
- Started with 289 errors caused by missing lib helpers and an undertyped `Database`. Net work: 25+ new files in lib/components/hooks; one fix in three existing routes (en-route timestamp bug; preferences route now writes to the dedicated `notification_preferences` table; device_type cast).

### Documentation (`docs/`)

- [00_REFERENCE.md](00_REFERENCE.md) — system reference.
- [01_BUSINESS_RULES.md](01_BUSINESS_RULES.md) — BR catalog.
- [02_FUNCTIONALITY.md](02_FUNCTIONALITY.md) — per-role feature inventory.
- [03_IMPLEMENTATION_PLAN.md](03_IMPLEMENTATION_PLAN.md) — phase plan.
- [04_DB_MODIFICATIONS.md](04_DB_MODIFICATIONS.md) — schema delta narrative.
- [05_IMPLEMENTATION_STATUS.md](05_IMPLEMENTATION_STATUS.md) — this file.

### SQL (`replication/sql/`)

- `02_schema_postgres.sql`, `04_rls_policies.sql`, `06_realtime.sql`, `07_user_devices.sql` — pre-existing, unchanged.
- `09_business_rules_migration.sql` — **NEW**, drafted in the prior pass. Adds `system_settings`, `notification_preferences`, audit triggers, payroll-lock trigger, `academic_terms`, `academic_breaks`, `sections`, `schedule_moves`, `fn_move_schedule`, `fn_materialize_sessions`, and tightened RLS. **NOT yet applied to the live database** (see §2).

---

## 2. Blocker: DB migrations not applied

The Supabase MCP `apply_migration` call to project `rrnuehahofdnkoxskqfs` was auto-denied by Claude Code's permission classifier as a shared-system change beyond the scope of "Implement Plans." Until you authorize and apply the migrations, every API route that touches the database will return 500s.

### To unblock

Apply in order (Supabase Dashboard SQL Editor or `psql`):

```
1. replication/sql/02_schema_postgres.sql
2. replication/sql/04_rls_policies.sql
3. replication/sql/06_realtime.sql
4. replication/sql/07_user_devices.sql
5. replication/sql/05_seed_dev.sql           (dev) — OR — 08_real_data_seed.sql (prod-shape)
6. replication/sql/09_business_rules_migration.sql   ← NEW
```

After step 1, also create the Storage buckets `session-photos` and `hr-exports` (both PRIVATE) per [REPLICATION.md](../replication/REPLICATION.md) §4.

Optional but recommended after step 6:

```sql
select cron.schedule(
  'fluxtrack_session_materializer',
  '0 17 * * *',  -- 01:00 Manila
  $$select public.fn_materialize_sessions(14)$$
);
```

### If you'd rather have me apply it

Reply with explicit approval ("apply the SQL migrations to the FluxTrack_Capstone Supabase project") and I will run them via the MCP. The classifier defers to explicit authorization.

---

## 3. Second pass — deferred items now shipped

The 2026-05-13 follow-up pass closed every deferred Phase 0–6 item that did not require remote DB authorization.

### New routes / pages

| Path | Phase | Backs |
|---|---|---|
| [/apis/admin/settings](../fluxtrack/app/apis/admin/settings/route.ts) (GET, PATCH) | 6 | BR-SYS-4 — system_settings editor. |
| [/apis/admin/audit](../fluxtrack/app/apis/admin/audit/route.ts) (GET) | 6 | BR-SYS-1, BR-SYS-6 — paginated audit reader (admin + HR). |
| [/apis/admin/jobs](../fluxtrack/app/apis/admin/jobs/route.ts) (GET), [/apis/admin/jobs/run](../fluxtrack/app/apis/admin/jobs/run/route.ts) (POST) | 6 | BR-SYS-5 — read pg_cron.jobs and ad-hoc trigger materializer / photo / export cleanups. |
| [/apis/hr/disputes/flag](../fluxtrack/app/apis/hr/disputes/flag/route.ts) (POST) | 5 | BR-HR-2 — HR-source dispute with hr_flag_note ≥ 20, stamps sessions.hr_flag_*. |
| [/admin/admin-settings](../fluxtrack/app/admin/admin-settings/page.tsx) | 6 | UI for system_settings tunables. |
| [/admin/admin-audit](../fluxtrack/app/admin/admin-audit/page.tsx) | 6 | Filterable audit-log explorer with pagination. |
| [/admin/admin-jobs](../fluxtrack/app/admin/admin-jobs/page.tsx) | 6 | Cron job list + "run now" buttons. |
| [/ifo/ifo-schedule/[id]](../fluxtrack/app/ifo/ifo-schedule/%5Bid%5D/page.tsx) | 2 | Schedule detail: term-span editor with session-count preview, archive (≥20-char reason) and restore. |
| [/ifo/ifo-schedule-move/[id]](../fluxtrack/app/ifo/ifo-schedule-move/%5Bid%5D/page.tsx) | 2 | Full 4-step move-class wizard (When → What → Conflicts → Confirm); uses `dry_run` pre-check. |
| [/faculty/disputes](../fluxtrack/app/faculty/disputes/page.tsx) | 1 | Faculty file/list disputes with optional photo evidence (uses `/apis/photos/upload`). |

### New ops / SQL

| File | Purpose |
|---|---|
| [replication/functions/push-send/index.ts](../replication/functions/push-send/index.ts) | Deno edge function. Two modes: single-subscription send and recipient fan-out across `user_devices`. Auto-deactivates devices on 404/410 (BR-NOT-2). |
| [replication/sql/10_cron_monitors.sql](../replication/sql/10_cron_monitors.sql) | The eight 5-minute pg_cron monitors: absence, en-route expiry, extension timeout, overstay, payroll soft-lock expiry, payroll archive sweep, assist escalation, handover-protection expiry. Idempotent re-runnable. **NOT yet applied** (same DB-authorization gate). |

### Pre-existing edits in second pass

- [/apis/schedules/[id]/route.ts](../fluxtrack/app/apis/schedules/%5Bid%5D/route.ts) — PATCH body now accepts `term_start_date`, `term_end_date`, `section_id` so the new detail page can save them.

---

## 4. What still requires user action

| Item | What's needed |
|---|---|
| Apply SQL migrations `02` → `10` to the live Supabase project | DB DDL is auto-classified as shared/irreversible — you need to either run them yourself or explicitly authorize me. |
| Deploy edge functions: `supabase functions deploy push-send --no-verify-jwt` (plus the existing `photo-cleanup`, `export-cleanup`) | Requires `supabase login` + `supabase link --project-ref rrnuehahofdnkoxskqfs`. |
| Schedule the materializer cron (one-time) | `select cron.schedule('fluxtrack_session_materializer','0 17 * * *', $$select public.fn_materialize_sessions(14)$$);` |
| Storage buckets `session-photos`, `hr-exports` (private) | Create via Supabase Dashboard → Storage. |
| Phase 7: replication-time verification, OAuth flip, load test | These are out-of-band operational checks, not code. Procedure documented in [REPLICATION.md §9](../replication/REPLICATION.md). |

---

## 4. How to verify locally

1. Ensure `.env.local` is filled (it already is — `NEXT_PUBLIC_DEMO_MODE=true`).
2. From the `fluxtrack/` directory:
   ```
   npm run dev
   ```
3. Open <http://localhost:3000> — you should land on `/auth/login` with the 6 demo-role tiles.
4. Pick "Faculty" → `/faculty/dashboard`. Use the top-bar role switcher to cycle roles.

> Until the SQL migrations are applied (§2), API calls will fail and most pages will render with empty-states or error banners. The UI shells, routing, role switching, and demo banner all work without a DB.

---

## 5. Audit trail of source-level changes (cumulative)

```
fluxtrack/
├── proxy.ts                                                 NEW
├── app/page.tsx                                             REWRITE (was Next default)
├── app/auth/login/page.tsx                                  REWRITE
├── app/apis/schedules/[id]/archive/route.ts                 NEW
├── app/apis/schedules/[id]/move/route.ts                    NEW
├── app/apis/sections/route.ts                               NEW
├── app/apis/sections/[id]/route.ts                          NEW
├── app/apis/sections/[id]/conflicts/route.ts                NEW
├── app/apis/academic-terms/route.ts                         NEW
├── app/apis/academic-breaks/route.ts                        NEW
├── app/apis/users/me/preferences/route.ts                   REWRITE (column → table model)
├── app/apis/sessions/[id]/en-route/route.ts                 PATCH (toISOString bug)
├── app/apis/users/me/devices/route.ts                       PATCH (type narrowing)
├── app/apis/users/me/devices/[id]/route.ts                  PATCH (cast)
├── app/ifo/ifo-sections/page.tsx                            NEW
├── app/ifo/ifo-academic-calendar/page.tsx                   NEW
├── app/ifo/ifo-schedule/[id]/page.tsx                       NEW (pass 2)
├── app/ifo/ifo-schedule-move/[id]/page.tsx                  NEW (pass 2)
├── app/admin/admin-settings/page.tsx                        NEW (pass 2)
├── app/admin/admin-audit/page.tsx                           NEW (pass 2)
├── app/admin/admin-jobs/page.tsx                            NEW (pass 2)
├── app/faculty/disputes/page.tsx                            NEW (pass 2)
├── app/apis/admin/settings/route.ts                         NEW (pass 2)
├── app/apis/admin/audit/route.ts                            NEW (pass 2)
├── app/apis/admin/jobs/route.ts                             NEW (pass 2)
├── app/apis/admin/jobs/run/route.ts                         NEW (pass 2)
├── app/apis/hr/disputes/flag/route.ts                       NEW (pass 2)
├── app/apis/schedules/[id]/route.ts                         PATCH (term_*, section_id support)
├── replication/functions/push-send/index.ts                 NEW (pass 2)
├── replication/sql/10_cron_monitors.sql                     NEW (pass 2, DRAFT)
├── lib/auth/config.ts                                       NEW
├── lib/auth/server.ts                                       NEW
├── lib/auth/get-session.ts                                  NEW
├── lib/supabase/client.ts                                   NEW (existing lib/client.ts kept)
├── lib/supabase/server.ts                                   NEW (existing lib/server.ts kept)
├── lib/supabase/service.ts                                  NEW
├── lib/supabase/admin.ts                                    NEW (re-export)
├── lib/supabase/types.ts                                    NEW
├── lib/api/errors.ts                                        NEW
├── lib/api/respond.ts                                       NEW
├── lib/audit/log.ts                                         NEW
├── lib/push/vapid.ts                                        NEW
├── lib/utils/date.ts                                        NEW
├── lib/utils/modality.ts                                    NEW
├── lib/utils/session-status.ts                              NEW
├── components/layout/role-topbar.tsx                        NEW
├── components/layout/brand-logo.tsx                         NEW
├── components/layout/sidebar-shell.tsx                      NEW
├── components/layout/brand-sidebar.tsx                      NEW
├── components/ui/empty-state.tsx                            NEW
├── components/ui/kebab-menu.tsx                             NEW
├── components/ui/calendar.tsx                               PATCH (drop invalid table key)
├── components/demo/demo-banner.tsx                          NEW
├── components/demo/role-switcher.tsx                        NEW
├── hooks/use-room-polling.ts                                NEW
├── hooks/use-realtime-channel.ts                            NEW
├── hooks/use-active-session.ts                              NEW
├── hooks/use-assist-feed.ts                                 NEW
├── hooks/use-notifications.ts                               NEW
└── types/database.types.ts                                  NEW (re-exports)
```

Everything else under `app/{faculty,ifo,checker,guard,hr,admin}/**` and `app/apis/**` was already present in the repo and is now linked to the lib/UI/hooks layer.
