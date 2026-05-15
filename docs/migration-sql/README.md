# Migration SQL artifacts

Folder of executable + procedural artifacts that ship with the Postgres → MSSQL migration plan.

| File | What it is | When to run / read |
| --- | --- | --- |
| [`01_mssql_schema.sql`](./01_mssql_schema.sql) | Full MSSQL DDL. 24 tables, 21 ENUMs as CHECK constraints, 6 replacement triggers (overlap checks, updated-at touchers, locked-period guard, dispute counter). Idempotent — drops in reverse dependency order before creating. | Run **once** against a fresh MSSQL database before the data ETL. Re-run safely whenever the target DB needs to be reset (it will drop existing tables first). |
| [`02_data_etl.md`](./02_data_etl.md) | Step-by-step Postgres → MSSQL data transfer procedure, including a working Python ETL script skeleton (`psycopg` → `pyodbc` with `fast_executemany`). FK-safe table order, trigger-disable/enable sequencing, type-conversion notes, post-load verification queries. | Read in full before kicking off the ETL. The Python script lives at `fluxtrack_backend/scripts/etl.py` once Phase 1 lands. |

See [`../07_MIGRATION_DJANGO_MSSQL.md`](../07_MIGRATION_DJANGO_MSSQL.md) for the overall architecture, phase plan, and rationale.

## Quick run-through (target environment)

```bash
# 1. Create an empty MSSQL database (e.g. via SSMS or sqlcmd)
sqlcmd -S <host> -U <login> -Q "CREATE DATABASE fluxtrack;"

# 2. Apply the schema
sqlcmd -S <host> -d fluxtrack -U <login> -i 01_mssql_schema.sql

# 3. Confirm tables landed
sqlcmd -S <host> -d fluxtrack -U <login> -Q "SELECT COUNT(*) FROM sys.tables;"   -- expect 24

# 4. Run the ETL from the Django backend folder once it exists
cd ../../fluxtrack_backend
python scripts/etl.py --all --verify
```

## Notes

- The DDL targets **SQL Server 2019+** because it uses `ISJSON`, `JSON_VALUE`, and the `THROW` statement. Earlier versions need workarounds for each of those.
- Trigger-based overlap checks (sections × schedules; payroll period date ranges) replace Postgres GIST `EXCLUDE` constraints. Both checks are also enforced in the Django `Model.clean()` so the API responds with a structured 400 before the trigger fires.
- ENUM labels in MSSQL CHECK constraints match the Postgres labels verbatim — no value-remapping during ETL.
- The DDL is hand-written and authoritative for Phase 0–2. Once the Django models exist (Phase 2), `python manage.py makemigrations --check` should produce zero drift against this file; any difference is a bug in either side and must be reconciled before Phase 3 (data load).
