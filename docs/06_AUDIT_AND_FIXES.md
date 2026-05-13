# FluxTrack — Function Audit & Fix Plan (2026-05-14)

> Audit of every exported function in [`fluxtrack/`](../fluxtrack/) plus the SQL seed files.
> Pairs with [`05_IMPLEMENTATION_STATUS.md`](05_IMPLEMENTATION_STATUS.md).

## 1. Summary

Three parallel Explore agents reviewed:
- `fluxtrack/lib/**` (20 files) + `fluxtrack/proxy.ts`
- `fluxtrack/app/apis/**` (60 route handlers)
- `fluxtrack/app/{faculty,ifo,checker,guard,hr,admin,auth}/**` (32 pages)
- `replication/sql/{05_seed_dev,08_real_data_seed}.sql`

**Verdict:** the codebase is largely complete. **58/60 API routes are fully functional**, 30+ pages are fully wired (data fetch + form submission + loading/error/empty states), and the helpers under `lib/api/`, `lib/audit/`, `lib/push/`, `lib/utils/`, `lib/supabase/` all carry real implementations.

The actionable issues are narrow and listed below.

## 2. Findings

### 2.1 Duplicated Supabase clients (introduced by `npx shadcn add @supabase/supabase-client-nextjs`)

| File | Issue |
|---|---|
| [`fluxtrack/lib/client.ts`](../fluxtrack/lib/client.ts) | Duplicate of [`fluxtrack/lib/supabase/client.ts`](../fluxtrack/lib/supabase/client.ts). No app code imports `@/lib/client`. |
| [`fluxtrack/lib/server.ts`](../fluxtrack/lib/server.ts) | Duplicate of [`fluxtrack/lib/supabase/server.ts`](../fluxtrack/lib/supabase/server.ts). |
| [`fluxtrack/lib/middleware.ts`](../fluxtrack/lib/middleware.ts) | Overlaps with [`fluxtrack/proxy.ts`](../fluxtrack/proxy.ts) — Next 16 uses `proxy.ts`, not `middleware.ts`. |

### 2.2 Real STUB routes (1 of 60)

| Route | Methods | Current behaviour |
|---|---|---|
| [`/apis/rooms/[id]/route.ts`](../fluxtrack/app/apis/rooms/%5Bid%5D/route.ts) | GET, POST | Returns `{ message: "not implemented" }` 501 |

`/apis/admin/jobs` GET is flagged MINIMAL but its fallback (returning an explanatory note when pg_cron is unreachable) is intentional — leaving as-is.

### 2.3 Demo data tangled into auth helper

[`fluxtrack/lib/auth/server.ts`](../fluxtrack/lib/auth/server.ts) lines 18–73 hard-code `FALLBACK_DEMO_USERS` (six entries with stable UUIDs `00000000-0000-0000-0000-000000000001..6`). This is invoked from `getCurrentUser()` only when `isDemoMode()` is true, but the data lives in the same module as the production auth path.

### 2.4 Faculty dashboard photo upload is a UI fake

[`fluxtrack/app/faculty/dashboard/page.tsx:272`](../fluxtrack/app/faculty/dashboard/page.tsx#L272):

```
// demo: photo upload not wired; we send a stable placeholder path for f2f/blended
photo_storage_path: photoCaptured ? `demo/${actionTarget.sessionId}.jpg` : undefined,
```

The button at line 645 just toggles a boolean — no `<input type="file">`, no `/apis/photos/upload` call. The API route at [`/apis/photos/upload`](../fluxtrack/app/apis/photos/upload/route.ts) is fully functional and waiting for a real caller.

### 2.5 SQL seed separation lacks a runtime guard

Both [`05_seed_dev.sql`](../replication/sql/05_seed_dev.sql) and [`08_real_data_seed.sql`](../replication/sql/08_real_data_seed.sql) are idempotent (TRUNCATE / DELETE first, then INSERT). They are mutually exclusive by design, but **nothing prevents an operator from accidentally running `05_seed_dev.sql` against the live project**. Both files share the same faculty UUIDs intentionally so schedules in `08_*` can reference the seeded accounts.

## 3. Fix plan

| # | Fix | Scope |
|---|---|---|
| 1 | Delete `lib/client.ts`, `lib/server.ts`, `lib/middleware.ts`; remove the `@supabase` block from `components.json`. | Cleanup |
| 2 | Implement `GET` and `PATCH` for `/apis/rooms/[id]` (GET = room + active-session lookup; PATCH = admin/ifo edit). | Stub fill |
| 3 | Move `FALLBACK_DEMO_USERS` to new `lib/auth/demo-data.ts`; have it throw if accessed when `!isDemoMode()`. | Refactor |
| 4 | Add a `SET LOCAL app.seed_mode` guard at the top of `05_seed_dev.sql` (refuses without `'demo'`) and `08_real_data_seed.sql` (refuses without `'real'`). Document the convention in a new `replication/sql/README.md`. | Safety |
| 5 | Wire real `/apis/photos/upload` into the faculty check-in flow with a hidden `<input type="file" accept="image/*" capture="environment">`. Drop the placeholder comment + path. | Stub fill |

## 4. Verification

After fixes:
- `npx tsc --noEmit` from `fluxtrack/` — must stay at 0 errors in the modified files.
- Manual smoke (where the DB is reachable): `GET /apis/rooms/{id}` returns the row; `PATCH` updates `capacity` / `is_active`; faculty check-in for an f2f session uploads a real photo and the resulting `storage_path` lands on the session row.
- `psql -v ON_ERROR_STOP=1 -f replication/sql/05_seed_dev.sql` without the GUC set must abort; setting `-c "SET app.seed_mode = 'demo'"` (or the wrapper documented in `replication/sql/README.md`) must succeed.
