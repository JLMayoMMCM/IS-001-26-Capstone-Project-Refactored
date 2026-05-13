# FluxTrack — Export Bundle

This folder is the **minimum file set** required to bring up a fresh FluxTrack instance from scratch. It is described formally in [SRS v6.0 Part 11](../SRS/FluxTrack_SRS_v6.0.md#part-11--export-bundle-manifest).

## Start here

→ **[REPLICATION.md](REPLICATION.md)** — step-by-step bootstrap guide.

## Contents

```
replication/
├── README.md                  ← you are here
├── REPLICATION.md             ← step-by-step setup instructions
├── .env.local.example         ← env-var template (copy to project root as .env.local)
│
├── config/                    ← pinned root-level config files
│   ├── package.json
│   ├── tsconfig.json
│   ├── next.config.ts
│   ├── postcss.config.mjs
│   ├── eslint.config.mjs
│   └── .gitignore
│
├── docs/                      ← engineering conventions
│   ├── AGENTS.md
│   └── CLAUDE.md
│
├── sql/                       ← database bootstrap (apply in order)
│   ├── 02_schema_postgres.sql      (1) schema, ENUMs, indexes, triggers
│   ├── 04_rls_policies.sql         (2) Row Level Security
│   ├── 06_realtime.sql             (3) Realtime publication wiring
│   ├── 07_user_devices.sql         (4) Multi-device push subscriptions
│   ├── 05_seed_dev.sql             (5a) Dev seed: 5 users per role
│   └── 08_real_data_seed.sql       (5b) Prod-shape seed: real MMCM rooms/courses
│
└── functions/                 ← Supabase Edge Functions (Deno)
    ├── photo-cleanup/         daily 03:00 Manila — purge expired photos
    ├── export-cleanup/        daily 03:30 Manila — purge expired HR exports
    └── push-send/             VAPID fan-out (placeholder — see push-send/README.md)
```

## Not included (intentional)

- `node_modules/` — run `npm ci` after copying `config/package.json` to the project root.
- `.env.local` — sensitive; copy `.env.local.example` and fill values.
- `src/` application code — checked into the repo proper. This bundle is for *configs + schema + edge functions*, not app source.

## What this bundle replaces

This export folder is the artifact a successor team needs to:

1. Reproduce the database schema on a new Supabase project.
2. Configure dependencies and tooling on a clean machine.
3. Deploy and schedule the Edge Functions for retention cleanup.
4. Understand the engineering conventions baked into the code.

For the running source, see [`../src/`](../src/). For the full system specification, see [`../SRS/FluxTrack_SRS_v6.0.md`](../SRS/FluxTrack_SRS_v6.0.md).
