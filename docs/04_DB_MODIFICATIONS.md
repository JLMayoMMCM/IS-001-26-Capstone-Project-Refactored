# FluxTrack — Database Modifications

> Narrative for the SQL changes encoded in [`../replication/sql/09_business_rules_migration.sql`](../replication/sql/09_business_rules_migration.sql). This migration is **DRAFT — not yet applied**. Apply after `08_real_data_seed.sql` (or in parallel for a fresh project).

The migration only adds; it does not drop existing columns or tables. Existing data remains valid.

---

## A. New table — `system_settings`

Purpose: hold the tunables that BRs reference as defaults (check-in window, courtesy window, dispute SLA, etc.) so system_admin can change them without a deploy.

| Column | Type | Notes |
|---|---|---|
| `key` | `text PRIMARY KEY` | e.g. `faculty.checkin_window_minutes_before`. |
| `value` | `jsonb NOT NULL` | typed value (`{"v": 10}` for numbers, `{"v": true}` for booleans). |
| `value_type` | `text NOT NULL CHECK (value_type IN ('integer','boolean','string','minutes','hours','enum'))` | runtime validation hint. |
| `description` | `text` | shown in the admin UI. |
| `updated_at` | `timestamptz NOT NULL DEFAULT now()` | trigger-maintained. |
| `updated_by` | `uuid REFERENCES public.users(id)` | who last changed it. |

Seeded defaults (matching the BR document):

| key | value | BR |
|---|---|---|
| `faculty.checkin_window_minutes_before` | 10 | BR-FAC-3 |
| `faculty.checkin_window_minutes_after` | 15 | BR-FAC-3 |
| `faculty.late_grace_minutes` | 30 | BR-FAC-7 |
| `faculty.early_end_threshold_minutes` | 15 | BR-FAC-10 |
| `faculty.courtesy_window_minutes` | 5 | BR-FAC-13 |
| `faculty.dispute_window_days` | 7 | BR-FAC-16 |
| `extension.max_minutes` | 30 | BR-FAC-11 |
| `extension.response_deadline_minutes` | 5 | BR-FAC-12 |
| `assist.ifo_escalation_minutes` | 10 | BR-IFO-6 |
| `assist.guard_resolution_deadline_minutes` | 30 | BR-GRD-2 |
| `dispute.ifo_sla_hours` | 48 | BR-IFO-12 |
| `payroll.soft_lock_hours` | 72 | BR-HR-6 |
| `payroll.archive_after_days` | 90 | BR-HR-9 |
| `photos.retention_days` | 30 | BR-GEN-10 |
| `exports.retention_days` | 30 | BR-GEN-10 |

RLS: SELECT for all authenticated users (UI needs to read its own limits); UPDATE/INSERT/DELETE for `system_admin` only (BR-SYS-4).

---

## B. New column — `users.signout_after`

Purpose: implement BR-GEN-6 (role change forces sign-out). Application's auth helper compares `auth.users.last_sign_in_at < users.signout_after`; if so, the session is rejected.

```sql
ALTER TABLE public.users ADD COLUMN signout_after timestamptz;
```

A trigger on `users` sets `signout_after = now()` when `role` changes OR when `is_active` flips from `true` to `false`.

---

## C. New ENUM value — `dispute_remedial_action`

Approval-time remedial decisions (BR-IFO-11). Added as a separate ENUM rather than a `text` field for integrity.

```sql
CREATE TYPE dispute_remedial_action AS ENUM
  ('restore_completed','mark_early_end','keep_status','manual_adjust');
ALTER TABLE public.disputes
  ADD COLUMN remedial_action dispute_remedial_action;
```

Constraint: `remedial_action IS NOT NULL` when `status = 'approved'`.

---

## D. New table — `notification_preferences`

BR-NOT-4 (per-event mute). Single JSON in `users.push_subscription` is overloaded; split it out:

| Column | Type |
|---|---|
| `user_id` | `uuid PK REFERENCES users(id) ON DELETE CASCADE` |
| `event_type` | `varchar(100)` (composite PK with user_id) |
| `push_enabled` | `boolean NOT NULL DEFAULT true` |
| `in_app_enabled` | `boolean NOT NULL DEFAULT true` |
| `updated_at` | `timestamptz NOT NULL DEFAULT now()` |

RLS: self-only read/write.

---

## E. Audit trigger function

Single generic trigger `tg_emit_audit(event_prefix)` is attached to: `sessions`, `disputes`, `payroll_periods`, `users`, `hr_exports`, `assist_requests`, `extension_requests`. It writes one `audit_log` row per state-changing UPDATE/INSERT/DELETE, with:

```jsonb
{ "op": "UPDATE", "before": {...}, "after": {...}, "changed_keys": ["status","actual_end"] }
```

Implements BR-GEN-2 + the audit-event list at the end of [`01_BUSINESS_RULES.md`](01_BUSINESS_RULES.md).

---

## F. Payroll-lock enforcement trigger

BR-HR-8: hard-locked sessions are immutable.

```sql
CREATE FUNCTION tg_block_locked_session_update() RETURNS trigger
  -- Raises EXCEPTION when NEW.payroll_period_id references a period
  -- whose lock_stage IN ('hard','archived').
```

Attached `BEFORE UPDATE ON public.sessions`. The trigger allows updates to a small allowlist of columns (`hr_flag_note`, `hr_flagged_by`, `hr_flagged_at`) so HR can still annotate.

A second trigger maintains `payroll_periods.open_disputes_count` automatically from `disputes` writes.

---

## G. New constraints

1. Partial unique index — at most one `pending` dispute per session (BR-FAC-18):
   ```sql
   CREATE UNIQUE INDEX uq_one_pending_dispute_per_session
     ON public.disputes (session_id)
     WHERE status = 'pending';
   ```
2. CHECK — `disputes.decision_note` ≥ 20 chars when `status` ∈ (`approved`, `denied`).
3. CHECK — `sessions.force_end_reason` ≥ 20 chars when `force_ended_by IS NOT NULL` (BR-IFO-4).
4. EXCLUSION constraint — `payroll_periods` date ranges may not overlap (BR-HR-10):
   ```sql
   ALTER TABLE public.payroll_periods
     ADD CONSTRAINT pp_no_overlap
     EXCLUDE USING gist (daterange(date_from, date_to, '[]') WITH &&);
   ```
   Requires extension `btree_gist`.
5. CHECK — `hr_exports` references either `payroll_period_id` OR a date range, not neither (BR-HR-12).

---

## H. RLS policy additions

- `system_settings` — SELECT for all authenticated; ALL for system_admin only.
- `notification_preferences` — self-only ALL.
- Tighten `sessions` UPDATE policy so faculty cannot edit `hr_flag_*`, `force_*`, `payroll_period_id` (uses a row-level allowlist by leveraging a `WITH CHECK` that re-asserts unchanged values via `OLD = NEW` on those columns — done in Postgres via a BEFORE UPDATE trigger that nulls/restores blocked columns when actor role ≠ allowed roles).

---

## I. Indexes

- `idx_audit_event_time` on `audit_log (event_type, created_at DESC)` — supports the audit explorer.
- `idx_sessions_period_status` on `sessions (payroll_period_id, status)` — for HR records list.
- `idx_disputes_status_created` on `disputes (status, filed_at DESC)`.
- `idx_assist_unack` on `assist_requests (sent_at)` `WHERE ifo_acknowledged_at IS NULL` — escalation cron.
- `idx_ext_pending_deadline` on `extension_requests (response_deadline)` `WHERE status = 'pending'` — timeout cron.
- `idx_pp_lock_archive` on `payroll_periods (lock_stage, hard_locked_at)` — archive sweep cron.

---

## J0. Class lifecycle — sections, term span, soft-remove, move, breaks

Backs BR-IFO-15..27 and BR-FAC-23..24.

### J0.1 New table — `academic_terms`

Drives the term-span pickers and acts as the parent for breaks. A `schedules.academic_term` value MUST match one of these `code`s (FK constraint added after a one-time backfill).

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | gen_random_uuid. |
| `code` | `varchar(50) UNIQUE NOT NULL` | e.g. `2026-1T`. |
| `name` | `text NOT NULL` | display label. |
| `term_start_date` | `date NOT NULL` | default span for new schedules. |
| `term_end_date` | `date NOT NULL` | `term_end_date >= term_start_date`. |
| `is_active` | `boolean NOT NULL DEFAULT true` | |

### J0.2 New table — `academic_breaks`

Dates skipped during session materialization (BR-IFO-27).

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `term_id` | `uuid REFERENCES academic_terms(id) ON DELETE CASCADE` | |
| `date_from` | `date NOT NULL` | |
| `date_to` | `date NOT NULL` | `>= date_from`. |
| `label` | `text NOT NULL` | e.g. "Holy Week". |
| `is_active` | `boolean NOT NULL DEFAULT true` | |

Index: `(term_id, date_from, date_to)`.

### J0.3 New table — `sections`

Catalog used to detect "the same students would be in two places" conflicts (BR-IFO-23..25).

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `academic_term_id` | `uuid REFERENCES academic_terms(id) ON DELETE RESTRICT` | |
| `section_code` | `varchar(40) NOT NULL` | e.g. `BSCS-2A`. |
| `program` | `text` | e.g. `BS Computer Science`. |
| `year_level` | `int` | nullable. |
| `student_count` | `int NOT NULL DEFAULT 0` | informational; not enforced against `enrolled_count`. |
| `is_active` | `boolean NOT NULL DEFAULT true` | |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` | |
| `created_by` | `uuid REFERENCES users(id)` | |

UNIQUE `(academic_term_id, section_code)`.

### J0.4 `schedules` — term span, section FK, archive fields, move-link

```sql
ALTER TABLE public.schedules
  ADD COLUMN term_start_date     date,
  ADD COLUMN term_end_date       date,
  ADD COLUMN section_id          uuid REFERENCES public.sections(id),
  ADD COLUMN archived_at         timestamptz,
  ADD COLUMN archived_by         uuid REFERENCES public.users(id),
  ADD COLUMN archive_reason      text,
  ADD COLUMN replaced_by_schedule_id uuid REFERENCES public.schedules(id),
  ADD COLUMN replaces_schedule_id    uuid REFERENCES public.schedules(id);
```

Constraints:

- `CHECK (term_end_date IS NULL OR term_start_date IS NULL OR term_end_date >= term_start_date)`.
- `CHECK (archived_at IS NULL OR (archive_reason IS NOT NULL AND char_length(archive_reason) >= 20))` (BR-IFO-17).
- `CHECK (is_active = true OR archived_at IS NOT NULL)` — soft remove must stamp the timestamp.
- `replaced_by_schedule_id` ≠ `id`; same for `replaces_schedule_id`.

Backfill: an idempotent UPDATE populates `term_start_date`/`term_end_date` from the matching `academic_terms` row (the migration leaves nulls when no match is found).

### J0.5 Section-conflict exclusion constraint (BR-IFO-25)

```sql
-- requires btree_gist (already enabled in section A)
ALTER TABLE public.schedules
  ADD CONSTRAINT sched_no_section_overlap
  EXCLUDE USING gist (
    section_id WITH =,
    day_of_week WITH =,
    tsrange(
      ('2000-01-01 ' || start_time)::timestamp,
      ('2000-01-01 ' || end_time)::timestamp,
      '[)'
    ) WITH &&
  )
  WHERE (is_active = true AND section_id IS NOT NULL);
```

The trick: we materialize the time-of-day into a fixed-date `tsrange` so GIST can compare overlaps. The `WHERE` scope keeps archived rows out of the index.

### J0.6 New table — `schedule_moves`

Audit/log of every move (BR-IFO-20). Distinct from generic `audit_log` because the UI consumes this directly.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `original_schedule_id` | `uuid NOT NULL REFERENCES schedules(id)` | |
| `new_schedule_id` | `uuid NOT NULL REFERENCES schedules(id)` | |
| `effective_from` | `date NOT NULL` | |
| `moved_by` | `uuid NOT NULL REFERENCES users(id)` | |
| `moved_at` | `timestamptz NOT NULL DEFAULT now()` | |
| `diff` | `jsonb NOT NULL` | `{ "room_id": [old,new], "start_time": [...], ... }`. |
| `sessions_repointed` | `int NOT NULL DEFAULT 0` | how many future `scheduled` sessions were re-pointed. |

Index: `(original_schedule_id)`, `(new_schedule_id)`, `(moved_at DESC)`.

### J0.7 Re-pointing function (used by the move endpoint)

`public.fn_move_schedule(p_schedule_id uuid, p_effective_from date, p_new jsonb)`:

1. Open a serializable transaction.
2. Verify the original schedule is active and `p_effective_from > CURRENT_DATE`.
3. Insert a new row in `schedules` with the merged fields and `term_start_date = p_effective_from`, `term_end_date = original.term_end_date`, `replaces_schedule_id = original.id`.
4. Update the original: set `term_end_date = p_effective_from - 1` and `replaced_by_schedule_id = new.id`.
5. `UPDATE sessions SET schedule_id = new.id, room_id = new.room_id WHERE schedule_id = original.id AND session_date >= p_effective_from AND status = 'scheduled'`.
6. Insert a `schedule_moves` row capturing the diff + `sessions_repointed = ROW_COUNT`.
7. Emit notifications via `notifications` insert for `faculty_id` and (optionally) the section's faculty list.

If any step fails, the transaction rolls back and the API returns 409 with the violating constraint or 422 with field details.

### J0.8 Materializer function (replaces ad-hoc T−10min creation)

`public.fn_materialize_sessions(p_horizon_days int DEFAULT 14)`:

For every active, non-archived schedule:

```
FOR d IN [GREATEST(term_start_date, today),
          LEAST(term_end_date, today + p_horizon_days)]
  WHERE dow(d) = schedule.day_of_week
    AND NOT EXISTS (active academic_break covering d)
    AND NOT EXISTS (sessions row for (schedule_id, d))
INSERT scheduled session.
```

Scheduled via `pg_cron` nightly at `01:00 Manila`.

### J0.9 RLS additions

- `academic_terms`, `academic_breaks`, `sections`: SELECT for all authenticated; ALL for `ifo_admin` + `system_admin`.
- `schedule_moves`: SELECT for `ifo_admin`, `hr_admin`, `system_admin`, AND the affected `faculty_id` (via `EXISTS (SELECT 1 FROM schedules s WHERE (s.id = original_schedule_id OR s.id = new_schedule_id) AND s.faculty_id = auth.uid())`). No direct INSERT/UPDATE/DELETE from clients — only via `fn_move_schedule` running as service role.
- `schedules`: SELECT keeps existing behavior. Faculty SELECT MUST exclude rows where `is_active = false` AND requester isn't IFO/HR/system_admin (BR-IFO-17 visibility rule).

---

## J. Realtime publication additions

`disputes` is already useful for IFO + HR live queues; add it to `supabase_realtime`. (Optional but unlocks live dispute counts.)

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.disputes;
```

---

## K. Migration ordering

Apply order on a fresh DB (extends the README table):

```
1. 02_schema_postgres.sql
2. 04_rls_policies.sql
3. 06_realtime.sql
4. 07_user_devices.sql
5. 05_seed_dev.sql   OR   08_real_data_seed.sql
6. 09_business_rules_migration.sql   ← NEW (this file)
```

On an existing DB: apply just `09_*` last; it is additive and idempotent.

---

## L. Things NOT changed

- All 17 base tables keep their primary keys and columns. `schedules.section` (varchar) is **kept** during the migration window; new code reads `section_id`. A later migration may drop the varchar.
- Existing ENUMs are untouched; we add `dispute_remedial_action` as a NEW enum (no `ALTER TYPE`).
- All existing indexes remain.
- The `tg_set_updated_at` helper is reused, not redefined.
- Existing `is_active` semantics on `schedules` extend (not replace) — archive is the strong form: `is_active=false AND archived_at IS NOT NULL`.
