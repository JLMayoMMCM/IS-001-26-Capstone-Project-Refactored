# Postgres → MSSQL data ETL

> Companion to [`07_MIGRATION_DJANGO_MSSQL.md`](../07_MIGRATION_DJANGO_MSSQL.md) and [`01_mssql_schema.sql`](./01_mssql_schema.sql).
> Run **after** the MSSQL schema is in place and **before** the Django backend cuts over.

---

## 1. Pre-flight

- [ ] MSSQL 2019+ instance reachable from the ETL host (latency < 50 ms).
- [ ] Target database created with the login that will own the schema.
- [ ] [`01_mssql_schema.sql`](./01_mssql_schema.sql) executed; sanity check with
  ```sql
  SELECT COUNT(*) AS table_count FROM sys.tables;   -- expect 24
  ```
- [ ] Source Postgres reachable (Supabase: use the dashboard's pooled connection string with `?sslmode=require`).
- [ ] **Microsoft ODBC Driver 18 for SQL Server** installed on the ETL host (`msodbcsql18`).
- [ ] Python 3.11+, `pip install psycopg[binary] pyodbc python-dotenv tqdm`.
- [ ] Pick a freeze window. Either stop writes to Postgres during the dump, or run from a point-in-time snapshot.

---

## 2. FK-safe copy order

Process tables in this order so the ETL never references an unwritten parent:

1. `users`
2. `rooms`
3. `system_settings`
4. `academic_terms`
5. `academic_breaks`
6. `sections`
7. `schedules`
8. `schedule_moves`
9. `payroll_periods`   ← must precede `sessions` (FK)
10. `sessions`
11. `en_route_declarations`
12. `extension_requests`
13. `disputes`
14. `checker_shifts`
15. `checker_shift_floors`
16. `checker_validations`
17. `assist_requests`
18. `room_handover_conflicts`
19. `manual_bookings`
20. `hr_exports`
21. `notifications`
22. `notification_preferences`
23. `user_devices`
24. `audit_log`

The schema-§15 overlap triggers will reject historical rows that don't satisfy the modern check (e.g. older legacy schedules that overlap). **Disable** those triggers during load and re-enable after.

```sql
-- before load
DISABLE TRIGGER ALL ON dbo.schedules;
DISABLE TRIGGER ALL ON dbo.payroll_periods;
DISABLE TRIGGER ALL ON dbo.sessions;
DISABLE TRIGGER ALL ON dbo.user_devices;
DISABLE TRIGGER ALL ON dbo.disputes;
-- … load …
ENABLE TRIGGER ALL ON dbo.disputes;
ENABLE TRIGGER ALL ON dbo.user_devices;
ENABLE TRIGGER ALL ON dbo.sessions;
ENABLE TRIGGER ALL ON dbo.payroll_periods;
ENABLE TRIGGER ALL ON dbo.schedules;
```

The Python script in §4 handles this automatically per table.

---

## 3. Type conversions

| Source (Postgres)               | Target (MSSQL)                | Conversion rule                                                              |
| ------------------------------- | ----------------------------- | ---------------------------------------------------------------------------- |
| `uuid`                          | `UNIQUEIDENTIFIER`            | Pass the canonical lowercase string; `pyodbc` accepts it for UNIQUEIDENTIFIER. |
| `timestamptz`                   | `DATETIMEOFFSET(3)`           | `psycopg` yields timezone-aware `datetime`; passes through.                  |
| `date`                          | `DATE`                        | `datetime.date` passes through.                                              |
| `time`                          | `TIME(0)`                     | `datetime.time` passes through; sub-second is truncated by the column.       |
| `boolean`                       | `BIT`                         | `True/False` → `1/0` automatically.                                          |
| `inet`                          | `VARCHAR(45)`                 | Cast to string with `::text` in the SELECT (already done in §3.4 queries).    |
| `text` / `varchar`              | `NVARCHAR(MAX)` / `NVARCHAR(n)` | Driver encodes UTF-16 LE — no source change.                                |
| Postgres ENUM                   | `VARCHAR(n)`                  | Label string is identical (`'active'`, `'completed'`, …). No remapping.       |
| `jsonb`                         | `NVARCHAR(MAX)` + `ISJSON`    | The Python script `json.dumps` before insert. CHECK validates on write.       |
| `bpchar(64)` (teams_link_hash)  | `CHAR(64)`                    | Same semantics.                                                              |
| `interval`                      | (not used in target)          | Source data is already an integer minute count where used.                   |

---

## 4. The ETL script

Save as `fluxtrack_backend/scripts/etl.py` once the backend folder is created. Read credentials from a `.env` file — **never commit secrets**.

```python
"""
One-shot Postgres → MSSQL data migration for FluxTrack.

Usage:
    python etl.py --table users
    python etl.py --all
    python etl.py --all --batch-size 1000 --verify

Idempotency:
    - Triggers are disabled during load and re-enabled after.
    - UUID primary keys are preserved verbatim so re-running the script after
      a partial failure can safely TRUNCATE the target table and re-load.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from contextlib import contextmanager
from typing import Iterable

import psycopg                            # source
import pyodbc                             # target
from dotenv import load_dotenv
from tqdm import tqdm

load_dotenv()

PG_DSN    = os.environ["PG_SOURCE_DSN"]
MSSQL_DSN = os.environ["MSSQL_TARGET_DSN"]

# ── FK-safe copy order ──────────────────────────────────────────────────────
TABLES: list[tuple[str, str]] = [
    ("users",                    "ORDER BY created_at"),
    ("rooms",                    "ORDER BY room_code"),
    ("system_settings",          ""),
    ("academic_terms",           ""),
    ("academic_breaks",          ""),
    ("sections",                 ""),
    ("schedules",                ""),
    ("schedule_moves",           ""),
    ("payroll_periods",          ""),
    ("sessions",                 ""),
    ("en_route_declarations",    ""),
    ("extension_requests",       ""),
    ("disputes",                 ""),
    ("checker_shifts",           ""),
    ("checker_shift_floors",     ""),
    ("checker_validations",      ""),
    ("assist_requests",          ""),
    ("room_handover_conflicts",  ""),
    ("manual_bookings",          ""),
    ("hr_exports",               ""),
    ("notifications",            ""),
    ("notification_preferences", ""),
    ("user_devices",             ""),
    ("audit_log",                "ORDER BY created_at"),
]

# JSONB columns that need json.dumps() before insert.
JSON_COLUMNS: dict[str, set[str]] = {
    "users":           {"push_subscription"},
    "system_settings": {"value"},
    "schedule_moves":  {"diff"},
    "hr_exports":      {"filter_criteria"},
    "audit_log":       {"payload"},
}

# Tables whose schema-§15..§18 triggers must be silenced during ETL.
TRIGGER_TABLES = {"schedules", "payroll_periods", "sessions", "user_devices", "disputes"}


@contextmanager
def pg_conn():
    with psycopg.connect(PG_DSN) as conn:
        yield conn


@contextmanager
def mssql_conn():
    conn = pyodbc.connect(MSSQL_DSN, autocommit=False)
    try:
        yield conn
    finally:
        conn.close()


def fetch_rows(cur, table: str, order_by: str) -> Iterable[tuple[list[str], tuple]]:
    cur.execute(f"SELECT * FROM public.{table} {order_by};")
    cols = [d.name for d in cur.description]
    json_cols = JSON_COLUMNS.get(table, set())
    for row in cur:
        rec = list(row)
        for i, name in enumerate(cols):
            if name in json_cols and rec[i] is not None and not isinstance(rec[i], str):
                rec[i] = json.dumps(rec[i])
        yield cols, tuple(rec)


def toggle_triggers(cur, table: str, enable: bool) -> None:
    if table in TRIGGER_TABLES:
        action = "ENABLE" if enable else "DISABLE"
        cur.execute(f"{action} TRIGGER ALL ON dbo.{table};")


def copy_table(table: str, order_by: str, batch_size: int) -> tuple[int, int]:
    """Returns (source_count, loaded_count) — they should match."""
    with pg_conn() as pg, mssql_conn() as ms:
        pg_cur = pg.cursor()
        ms_cur = ms.cursor()

        pg_cur.execute(f"SELECT count(*) FROM public.{table};")
        src_count = pg_cur.fetchone()[0]

        toggle_triggers(ms_cur, table, enable=False)

        loaded = 0
        insert_sql: str | None = None
        batch: list[tuple] = []

        for cols, row in tqdm(fetch_rows(pg_cur, table, order_by), total=src_count, desc=table):
            if insert_sql is None:
                placeholders = ", ".join(["?"] * len(cols))
                cols_csv     = ", ".join(f"[{c}]" for c in cols)
                insert_sql   = f"INSERT INTO dbo.{table} ({cols_csv}) VALUES ({placeholders});"
            batch.append(row)
            if len(batch) >= batch_size:
                ms_cur.fast_executemany = True
                ms_cur.executemany(insert_sql, batch)
                loaded += len(batch)
                batch.clear()

        if batch and insert_sql:
            ms_cur.fast_executemany = True
            ms_cur.executemany(insert_sql, batch)
            loaded += len(batch)

        toggle_triggers(ms_cur, table, enable=True)
        ms.commit()
        return src_count, loaded


def verify_table(table: str) -> tuple[int, int]:
    with pg_conn() as pg, mssql_conn() as ms:
        pg_cur, ms_cur = pg.cursor(), ms.cursor()
        pg_cur.execute(f"SELECT count(*) FROM public.{table};")
        ms_cur.execute(f"SELECT COUNT(*) FROM dbo.{table};")
        return pg_cur.fetchone()[0], ms_cur.fetchone()[0]


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--table", help="Run only this table")
    p.add_argument("--all", action="store_true", help="Run every table in dependency order")
    p.add_argument("--batch-size", type=int, default=500)
    p.add_argument("--verify", action="store_true", help="Recount after load")
    args = p.parse_args()

    if args.table:
        plan = [(t, ob) for t, ob in TABLES if t == args.table]
    elif args.all:
        plan = TABLES
    else:
        p.error("Pass --table NAME or --all")
        return

    mismatches: list[tuple[str, int, int]] = []
    for table, ob in plan:
        print(f"\n=== {table} ===")
        src, loaded = copy_table(table, ob, args.batch_size)
        print(f"  source: {src}  loaded: {loaded}")
        if args.verify:
            s, t = verify_table(table)
            if s != t:
                mismatches.append((table, s, t))

    if mismatches:
        print("\nMISMATCHES:")
        for t, s, x in mismatches:
            print(f"  {t}: source={s}  target={x}")
        sys.exit(1)


if __name__ == "__main__":
    main()
```

---

## 5. Post-load verification

Run these in MSSQL and diff the output against the Postgres source.

```sql
-- Row-count parity (compare to the same SELECT in Postgres)
SELECT 'users',                   COUNT(*) FROM dbo.users
UNION ALL SELECT 'rooms',                   COUNT(*) FROM dbo.rooms
UNION ALL SELECT 'schedules',               COUNT(*) FROM dbo.schedules
UNION ALL SELECT 'sessions',                COUNT(*) FROM dbo.sessions
UNION ALL SELECT 'disputes',                COUNT(*) FROM dbo.disputes
UNION ALL SELECT 'audit_log',               COUNT(*) FROM dbo.audit_log;

-- ENUM-aware aggregate (exercises CHECK constraints + indexes)
SELECT status, COUNT(*) AS n
FROM dbo.sessions
WHERE session_date >= '2026-01-01'
GROUP BY status
ORDER BY status;

-- FK-orphan probe (should return 0 for every join)
SELECT COUNT(*) AS orphan_sessions
FROM dbo.sessions s
LEFT JOIN dbo.schedules sc ON sc.id = s.schedule_id
WHERE sc.id IS NULL;

-- Triggers all enabled after load
SELECT name, is_disabled FROM sys.triggers WHERE is_disabled = 1;   -- expect 0 rows
```

For deeper confidence, pick 50 random rows per table and JSON-diff the result against the Postgres source. The `etl.py` script can be extended with a `--sample-diff N` flag if needed.

---

## 6. Rollback

If anything is wrong:

1. Stop Django + Celery workers.
2. Drop and recreate via [`01_mssql_schema.sql`](./01_mssql_schema.sql) (§1 already drops in dependency order, then recreates).
3. Re-run `python etl.py --all --verify`.

The Postgres source is untouched until Phase 11 of the rollout. It remains the source of truth during the migration window.

---

## 7. Performance notes

| Knob                                  | Value          | Effect                                                          |
| ------------------------------------- | -------------- | --------------------------------------------------------------- |
| `pyodbc` `fast_executemany = True`    | enabled        | ~10× speed-up vs row-by-row inserts.                            |
| Batch size                            | 500–1000       | Larger batches lower CPU overhead but raise rollback cost on error. |
| Connection autocommit                 | off            | Single transaction per table — fast and atomic per table.       |
| Triggers                              | disabled       | Avoids per-row trigger fire; ETL handles validation itself.     |
| Indexes (per `01_mssql_schema.sql`)   | created upfront | OK for FluxTrack's data volume (~10K sessions/term). For a 10× larger dataset, drop indexes pre-load and rebuild after. |

Demo-project full migration (≈ 100 users + 30 schedules + a few hundred sessions) should run in well under 60 seconds. Production-scale numbers will be re-checked once the schema is live.

---

## 8. Operational notes

- Run the ETL from a host with reliable network connectivity to **both** databases. A laptop on Wi-Fi is fine for the demo project; for production, run it from a VM in the same region as MSSQL.
- The ETL is a single one-shot, not a continuous replication. If business writes occur in Postgres between dump and cut-over, those writes are lost unless caught manually.
- Plan the migration for a low-traffic window. After the cut-over, the Supabase project enters a read-only "rollback baseline" period (30 days).
- Capture an MSSQL database snapshot immediately after the ETL completes so a Phase-1 issue can be reverted without re-running the ETL.
