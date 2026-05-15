/* ============================================================================
   FluxTrack — MSSQL schema baseline
   ----------------------------------------------------------------------------
   Target:    Microsoft SQL Server 2019+ (uses ISJSON, JSON_VALUE, THROW)
   Companion: docs/07_MIGRATION_DJANGO_MSSQL.md
              docs/migration-sql/02_data_etl.md

   Layout (in order):
     §1  Drop existing objects (idempotent rerun)
     §2  users
     §3  rooms
     §4  system_settings
     §5  academic_terms / academic_breaks / sections
     §6  schedules / schedule_moves
     §7  payroll_periods / hr_exports
     §8  sessions + dependents (en_route, extension, dispute, handover)
     §9  attendance (checker_shifts, floors, validations)
     §10 assists
     §11 manual_bookings
     §12 notifications + notification_preferences
     §13 user_devices
     §14 audit_log
     §15 Overlap-check triggers     (replaces Postgres GIST exclusion)
     §16 Touch-updated_at triggers  (replaces tg_set_updated_at)
     §17 Block-locked triggers      (replaces tg_block_locked_session_update)
     §18 Disputes ↔ payroll count   (replaces tg_disputes_maintain_period_count)

   Conventions:
     - UUID PKs: UNIQUEIDENTIFIER DEFAULT NEWSEQUENTIALID()
     - timestamptz → DATETIMEOFFSET(3)
     - jsonb → NVARCHAR(MAX) + ISJSON(...) CHECK
     - Postgres ENUMs → VARCHAR(n) + named CHECK (col IN (...))
     - Constraints named:  pk_*, fk_<table>_<col>, ck_<table>_<rule>,
                           uq_<table>_<cols>, df_<table>_<col>
     - Indexes named:      ix_<table>_<cols>
     - Triggers named:     trg_<table>_<purpose>
   ========================================================================== */

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

/* ──────────────────────────────────────────────────────────────────────────
   §1  Drop in reverse dependency order so reruns are safe
   ────────────────────────────────────────────────────────────────────────── */
IF OBJECT_ID('dbo.audit_log',                'U') IS NOT NULL DROP TABLE dbo.audit_log;
IF OBJECT_ID('dbo.notification_preferences', 'U') IS NOT NULL DROP TABLE dbo.notification_preferences;
IF OBJECT_ID('dbo.notifications',            'U') IS NOT NULL DROP TABLE dbo.notifications;
IF OBJECT_ID('dbo.user_devices',             'U') IS NOT NULL DROP TABLE dbo.user_devices;
IF OBJECT_ID('dbo.hr_exports',               'U') IS NOT NULL DROP TABLE dbo.hr_exports;
IF OBJECT_ID('dbo.payroll_periods',          'U') IS NOT NULL DROP TABLE dbo.payroll_periods;
IF OBJECT_ID('dbo.room_handover_conflicts',  'U') IS NOT NULL DROP TABLE dbo.room_handover_conflicts;
IF OBJECT_ID('dbo.assist_requests',          'U') IS NOT NULL DROP TABLE dbo.assist_requests;
IF OBJECT_ID('dbo.disputes',                 'U') IS NOT NULL DROP TABLE dbo.disputes;
IF OBJECT_ID('dbo.extension_requests',       'U') IS NOT NULL DROP TABLE dbo.extension_requests;
IF OBJECT_ID('dbo.en_route_declarations',    'U') IS NOT NULL DROP TABLE dbo.en_route_declarations;
IF OBJECT_ID('dbo.checker_validations',      'U') IS NOT NULL DROP TABLE dbo.checker_validations;
IF OBJECT_ID('dbo.checker_shift_floors',     'U') IS NOT NULL DROP TABLE dbo.checker_shift_floors;
IF OBJECT_ID('dbo.checker_shifts',           'U') IS NOT NULL DROP TABLE dbo.checker_shifts;
IF OBJECT_ID('dbo.manual_bookings',          'U') IS NOT NULL DROP TABLE dbo.manual_bookings;
IF OBJECT_ID('dbo.schedule_moves',           'U') IS NOT NULL DROP TABLE dbo.schedule_moves;
IF OBJECT_ID('dbo.sessions',                 'U') IS NOT NULL DROP TABLE dbo.sessions;
IF OBJECT_ID('dbo.schedules',                'U') IS NOT NULL DROP TABLE dbo.schedules;
IF OBJECT_ID('dbo.sections',                 'U') IS NOT NULL DROP TABLE dbo.sections;
IF OBJECT_ID('dbo.academic_breaks',          'U') IS NOT NULL DROP TABLE dbo.academic_breaks;
IF OBJECT_ID('dbo.academic_terms',           'U') IS NOT NULL DROP TABLE dbo.academic_terms;
IF OBJECT_ID('dbo.system_settings',          'U') IS NOT NULL DROP TABLE dbo.system_settings;
IF OBJECT_ID('dbo.rooms',                    'U') IS NOT NULL DROP TABLE dbo.rooms;
IF OBJECT_ID('dbo.users',                    'U') IS NOT NULL DROP TABLE dbo.users;
GO

/* ──────────────────────────────────────────────────────────────────────────
   §2  users
   ────────────────────────────────────────────────────────────────────────── */
CREATE TABLE dbo.users (
    id                UNIQUEIDENTIFIER  NOT NULL CONSTRAINT df_users_id        DEFAULT NEWSEQUENTIALID(),
    entra_id          NVARCHAR(255)     NULL,
    email             NVARCHAR(320)     NOT NULL,
    full_name         NVARCHAR(255)     NOT NULL,
    role              VARCHAR(16)       NOT NULL,
    faculty_id        VARCHAR(64)       NULL,
    department        NVARCHAR(255)     NULL,
    employment_type   VARCHAR(16)       NULL,
    is_active         BIT               NOT NULL CONSTRAINT df_users_is_active DEFAULT 1,
    push_subscription NVARCHAR(MAX)     NULL,
    created_at        DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_users_created   DEFAULT SYSDATETIMEOFFSET(),
    last_login        DATETIMEOFFSET(3) NULL,
    signout_after     DATETIMEOFFSET(3) NULL,
    CONSTRAINT pk_users                 PRIMARY KEY (id),
    CONSTRAINT uq_users_email           UNIQUE (email),
    CONSTRAINT uq_users_entra_id        UNIQUE (entra_id),
    CONSTRAINT uq_users_faculty_id      UNIQUE (faculty_id),
    CONSTRAINT ck_users_role            CHECK (role IN ('faculty','ifo_admin','checker','guard','hr_admin','system_admin')),
    CONSTRAINT ck_users_employment_type CHECK (employment_type IS NULL OR employment_type IN ('full_time','part_time')),
    CONSTRAINT ck_users_push_sub_json   CHECK (push_subscription IS NULL OR ISJSON(push_subscription) = 1)
);
CREATE INDEX ix_users_role_active ON dbo.users (role) WHERE is_active = 1;
CREATE INDEX ix_users_department  ON dbo.users (department);
GO

/* ──────────────────────────────────────────────────────────────────────────
   §3  rooms
   ────────────────────────────────────────────────────────────────────────── */
CREATE TABLE dbo.rooms (
    id           UNIQUEIDENTIFIER NOT NULL CONSTRAINT df_rooms_id        DEFAULT NEWSEQUENTIALID(),
    room_code    VARCHAR(32)      NOT NULL,
    building     NVARCHAR(64)     NOT NULL,
    floor_number INT              NOT NULL,
    room_type    VARCHAR(16)      NOT NULL,
    capacity     INT              NULL,
    is_active    BIT              NOT NULL CONSTRAINT df_rooms_is_active DEFAULT 1,
    CONSTRAINT pk_rooms      PRIMARY KEY (id),
    CONSTRAINT uq_rooms_code UNIQUE (room_code),
    CONSTRAINT ck_rooms_type CHECK (room_type IN ('lecture','lab','seminar','conference','other'))
);
CREATE INDEX ix_rooms_building_floor ON dbo.rooms (building, floor_number);
GO

/* ──────────────────────────────────────────────────────────────────────────
   §4  system_settings  (key/value with JSON-validated value)
   ────────────────────────────────────────────────────────────────────────── */
CREATE TABLE dbo.system_settings (
    [key]       VARCHAR(128)      NOT NULL,
    value       NVARCHAR(MAX)     NOT NULL,
    value_type  VARCHAR(16)       NOT NULL,
    description NVARCHAR(512)     NULL,
    updated_at  DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_settings_updated DEFAULT SYSDATETIMEOFFSET(),
    updated_by  UNIQUEIDENTIFIER  NULL,
    CONSTRAINT pk_system_settings     PRIMARY KEY ([key]),
    CONSTRAINT ck_settings_value_type CHECK (value_type IN ('integer','boolean','string','minutes','hours','enum')),
    CONSTRAINT ck_settings_json       CHECK (ISJSON(value) = 1),
    CONSTRAINT fk_settings_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users(id)
);
GO

/* ──────────────────────────────────────────────────────────────────────────
   §5  academic_terms / academic_breaks / sections
   ────────────────────────────────────────────────────────────────────────── */
CREATE TABLE dbo.academic_terms (
    id              UNIQUEIDENTIFIER  NOT NULL CONSTRAINT df_terms_id        DEFAULT NEWSEQUENTIALID(),
    code            VARCHAR(32)       NOT NULL,
    name            NVARCHAR(255)     NOT NULL,
    term_start_date DATE              NOT NULL,
    term_end_date   DATE              NOT NULL,
    is_active       BIT               NOT NULL CONSTRAINT df_terms_is_active DEFAULT 1,
    created_at      DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_terms_created   DEFAULT SYSDATETIMEOFFSET(),
    CONSTRAINT pk_academic_terms PRIMARY KEY (id),
    CONSTRAINT uq_terms_code     UNIQUE (code),
    CONSTRAINT ck_terms_dates    CHECK (term_end_date >= term_start_date)
);
GO

CREATE TABLE dbo.academic_breaks (
    id        UNIQUEIDENTIFIER NOT NULL CONSTRAINT df_breaks_id        DEFAULT NEWSEQUENTIALID(),
    term_id   UNIQUEIDENTIFIER NOT NULL,
    date_from DATE             NOT NULL,
    date_to   DATE             NOT NULL,
    label     NVARCHAR(255)    NOT NULL,
    is_active BIT              NOT NULL CONSTRAINT df_breaks_is_active DEFAULT 1,
    CONSTRAINT pk_academic_breaks PRIMARY KEY (id),
    CONSTRAINT fk_breaks_term     FOREIGN KEY (term_id) REFERENCES dbo.academic_terms(id) ON DELETE CASCADE,
    CONSTRAINT ck_breaks_dates    CHECK (date_to >= date_from)
);
CREATE INDEX ix_breaks_term ON dbo.academic_breaks (term_id);
GO

CREATE TABLE dbo.sections (
    id               UNIQUEIDENTIFIER  NOT NULL CONSTRAINT df_sections_id            DEFAULT NEWSEQUENTIALID(),
    academic_term_id UNIQUEIDENTIFIER  NOT NULL,
    section_code     VARCHAR(64)       NOT NULL,
    program          NVARCHAR(255)     NULL,
    year_level       INT               NULL,
    student_count    INT               NOT NULL CONSTRAINT df_sections_student_count DEFAULT 0,
    is_active        BIT               NOT NULL CONSTRAINT df_sections_is_active     DEFAULT 1,
    created_at       DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_sections_created       DEFAULT SYSDATETIMEOFFSET(),
    created_by       UNIQUEIDENTIFIER  NULL,
    CONSTRAINT pk_sections          PRIMARY KEY (id),
    CONSTRAINT fk_sections_term     FOREIGN KEY (academic_term_id) REFERENCES dbo.academic_terms(id),
    CONSTRAINT fk_sections_creator  FOREIGN KEY (created_by)       REFERENCES dbo.users(id),
    CONSTRAINT uq_sections_term_code UNIQUE (academic_term_id, section_code)
);
GO

/* ──────────────────────────────────────────────────────────────────────────
   §6  schedules / schedule_moves
   ────────────────────────────────────────────────────────────────────────── */
CREATE TABLE dbo.schedules (
    id                      UNIQUEIDENTIFIER  NOT NULL CONSTRAINT df_schedules_id        DEFAULT NEWSEQUENTIALID(),
    faculty_id              UNIQUEIDENTIFIER  NOT NULL,
    room_id                 UNIQUEIDENTIFIER  NOT NULL,
    course_code             VARCHAR(32)       NOT NULL,
    course_name             NVARCHAR(255)     NOT NULL,
    section                 VARCHAR(64)       NULL,
    enrolled_count          INT               NOT NULL CONSTRAINT df_schedules_enrolled  DEFAULT 0,
    scheduled_modality      VARCHAR(16)       NOT NULL,
    day_of_week             VARCHAR(8)        NOT NULL,
    start_time              TIME(0)           NOT NULL,
    end_time                TIME(0)           NOT NULL,
    academic_term           VARCHAR(32)       NOT NULL,
    is_active               BIT               NOT NULL CONSTRAINT df_schedules_is_active DEFAULT 1,
    term_start_date         DATE              NULL,
    term_end_date           DATE              NULL,
    section_id              UNIQUEIDENTIFIER  NULL,
    archived_at             DATETIMEOFFSET(3) NULL,
    archived_by             UNIQUEIDENTIFIER  NULL,
    archive_reason          NVARCHAR(512)     NULL,
    replaced_by_schedule_id UNIQUEIDENTIFIER  NULL,
    replaces_schedule_id    UNIQUEIDENTIFIER  NULL,
    CONSTRAINT pk_schedules                 PRIMARY KEY (id),
    CONSTRAINT fk_schedules_faculty         FOREIGN KEY (faculty_id)              REFERENCES dbo.users(id),
    CONSTRAINT fk_schedules_room            FOREIGN KEY (room_id)                 REFERENCES dbo.rooms(id),
    CONSTRAINT fk_schedules_section         FOREIGN KEY (section_id)              REFERENCES dbo.sections(id),
    CONSTRAINT fk_schedules_archived_by     FOREIGN KEY (archived_by)             REFERENCES dbo.users(id),
    CONSTRAINT fk_schedules_replaced_by     FOREIGN KEY (replaced_by_schedule_id) REFERENCES dbo.schedules(id),
    CONSTRAINT fk_schedules_replaces        FOREIGN KEY (replaces_schedule_id)    REFERENCES dbo.schedules(id),
    CONSTRAINT ck_schedules_modality        CHECK (scheduled_modality IN ('f2f','blended','online')),
    CONSTRAINT ck_schedules_day             CHECK (day_of_week IN ('mon','tue','wed','thu','fri','sat')),
    CONSTRAINT ck_schedules_time            CHECK (end_time > start_time)
);
CREATE INDEX ix_schedules_faculty     ON dbo.schedules (faculty_id) WHERE is_active = 1;
CREATE INDEX ix_schedules_room_day    ON dbo.schedules (room_id, day_of_week);
CREATE INDEX ix_schedules_section_day ON dbo.schedules (section_id, day_of_week) WHERE is_active = 1 AND section_id IS NOT NULL;
GO

CREATE TABLE dbo.schedule_moves (
    id                   UNIQUEIDENTIFIER  NOT NULL CONSTRAINT df_moves_id         DEFAULT NEWSEQUENTIALID(),
    original_schedule_id UNIQUEIDENTIFIER  NOT NULL,
    new_schedule_id      UNIQUEIDENTIFIER  NOT NULL,
    effective_from       DATE              NOT NULL,
    moved_by             UNIQUEIDENTIFIER  NOT NULL,
    moved_at             DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_moves_moved_at   DEFAULT SYSDATETIMEOFFSET(),
    diff                 NVARCHAR(MAX)     NOT NULL,
    sessions_repointed   INT               NOT NULL CONSTRAINT df_moves_repointed  DEFAULT 0,
    CONSTRAINT pk_schedule_moves PRIMARY KEY (id),
    CONSTRAINT fk_moves_original FOREIGN KEY (original_schedule_id) REFERENCES dbo.schedules(id),
    CONSTRAINT fk_moves_new      FOREIGN KEY (new_schedule_id)      REFERENCES dbo.schedules(id),
    CONSTRAINT fk_moves_moved_by FOREIGN KEY (moved_by)             REFERENCES dbo.users(id),
    CONSTRAINT ck_moves_diff_json CHECK (ISJSON(diff) = 1)
);
GO

/* ──────────────────────────────────────────────────────────────────────────
   §7  payroll_periods / hr_exports
   (declared before §8 because sessions has an FK to payroll_periods)
   ────────────────────────────────────────────────────────────────────────── */
CREATE TABLE dbo.payroll_periods (
    id                   UNIQUEIDENTIFIER  NOT NULL CONSTRAINT df_payroll_id              DEFAULT NEWSEQUENTIALID(),
    name                 NVARCHAR(64)      NOT NULL,
    date_from            DATE              NOT NULL,
    date_to              DATE              NOT NULL,
    lock_stage           VARCHAR(16)       NOT NULL CONSTRAINT df_payroll_lock_stage      DEFAULT 'none',
    soft_locked_at       DATETIMEOFFSET(3) NULL,
    soft_lock_expires_at DATETIMEOFFSET(3) NULL,
    hard_locked_at       DATETIMEOFFSET(3) NULL,
    archived_at          DATETIMEOFFSET(3) NULL,
    created_by           UNIQUEIDENTIFIER  NOT NULL,
    finalized_by         UNIQUEIDENTIFIER  NULL,
    record_count         INT               NOT NULL CONSTRAINT df_payroll_record_count    DEFAULT 0,
    open_disputes_count  INT               NOT NULL CONSTRAINT df_payroll_disputes_count  DEFAULT 0,
    CONSTRAINT pk_payroll_periods       PRIMARY KEY (id),
    CONSTRAINT uq_payroll_name          UNIQUE (name),
    CONSTRAINT fk_payroll_created_by    FOREIGN KEY (created_by)   REFERENCES dbo.users(id),
    CONSTRAINT fk_payroll_finalized_by  FOREIGN KEY (finalized_by) REFERENCES dbo.users(id),
    CONSTRAINT ck_payroll_lock_stage    CHECK (lock_stage IN ('none','soft','hard','archived')),
    CONSTRAINT ck_payroll_dates         CHECK (date_to >= date_from)
);
GO

CREATE TABLE dbo.hr_exports (
    id                UNIQUEIDENTIFIER  NOT NULL CONSTRAINT df_exports_id DEFAULT NEWSEQUENTIALID(),
    exported_by       UNIQUEIDENTIFIER  NOT NULL,
    payroll_period_id UNIQUEIDENTIFIER  NULL,
    date_from         DATE              NOT NULL,
    date_to           DATE              NOT NULL,
    format            VARCHAR(8)        NOT NULL,
    record_count      INT               NOT NULL,
    storage_path      NVARCHAR(512)     NULL,
    exported_at       DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_exports_at DEFAULT SYSDATETIMEOFFSET(),
    filter_criteria   NVARCHAR(MAX)     NULL,
    CONSTRAINT pk_hr_exports          PRIMARY KEY (id),
    CONSTRAINT fk_exports_exported_by FOREIGN KEY (exported_by)       REFERENCES dbo.users(id),
    CONSTRAINT fk_exports_period      FOREIGN KEY (payroll_period_id) REFERENCES dbo.payroll_periods(id),
    CONSTRAINT ck_exports_format      CHECK (format IN ('csv','pdf')),
    CONSTRAINT ck_exports_filter_json CHECK (filter_criteria IS NULL OR ISJSON(filter_criteria) = 1)
);
GO

/* ──────────────────────────────────────────────────────────────────────────
   §8  sessions + dependents
   ────────────────────────────────────────────────────────────────────────── */
CREATE TABLE dbo.sessions (
    id                         UNIQUEIDENTIFIER  NOT NULL CONSTRAINT df_sessions_id              DEFAULT NEWSEQUENTIALID(),
    schedule_id                UNIQUEIDENTIFIER  NOT NULL,
    faculty_id                 UNIQUEIDENTIFIER  NOT NULL,
    room_id                    UNIQUEIDENTIFIER  NOT NULL,
    session_date               DATE              NOT NULL,
    status                     VARCHAR(20)       NOT NULL CONSTRAINT df_sessions_status          DEFAULT 'scheduled',
    actual_modality            VARCHAR(16)       NULL,
    modality_override          BIT               NOT NULL CONSTRAINT df_sessions_mod_override    DEFAULT 0,
    wlan_on_campus             BIT               NULL,
    self_declared_on_campus    BIT               NOT NULL CONSTRAINT df_sessions_self_decl       DEFAULT 0,
    photo_storage_path         NVARCHAR(512)     NULL,
    photo_submitted            BIT               NOT NULL CONSTRAINT df_sessions_photo_submitted DEFAULT 0,
    photo_submitted_at         DATETIMEOFFSET(3) NULL,
    teams_link_hash            CHAR(64)          NULL,
    actual_start               DATETIMEOFFSET(3) NULL,
    actual_end                 DATETIMEOFFSET(3) NULL,
    duration_minutes           INT               NULL,
    extension_window_closes_at DATETIMEOFFSET(3) NULL,
    extension_status           VARCHAR(16)       NOT NULL CONSTRAINT df_sessions_ext_status      DEFAULT 'none',
    courtesy_window_start      DATETIMEOFFSET(3) NULL,
    overstay_flagged_at        DATETIMEOFFSET(3) NULL,
    payroll_period_id          UNIQUEIDENTIFIER  NULL,
    hr_flag_note               NVARCHAR(MAX)     NULL,
    hr_flagged_by              UNIQUEIDENTIFIER  NULL,
    hr_flagged_at              DATETIMEOFFSET(3) NULL,
    force_ended_by             UNIQUEIDENTIFIER  NULL,
    force_end_reason           NVARCHAR(512)     NULL,
    created_at                 DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_sessions_created         DEFAULT SYSDATETIMEOFFSET(),
    updated_at                 DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_sessions_updated         DEFAULT SYSDATETIMEOFFSET(),
    CONSTRAINT pk_sessions                PRIMARY KEY (id),
    CONSTRAINT fk_sessions_schedule       FOREIGN KEY (schedule_id)       REFERENCES dbo.schedules(id),
    CONSTRAINT fk_sessions_faculty        FOREIGN KEY (faculty_id)        REFERENCES dbo.users(id),
    CONSTRAINT fk_sessions_room           FOREIGN KEY (room_id)           REFERENCES dbo.rooms(id),
    CONSTRAINT fk_sessions_payroll        FOREIGN KEY (payroll_period_id) REFERENCES dbo.payroll_periods(id),
    CONSTRAINT fk_sessions_hr_flagged_by  FOREIGN KEY (hr_flagged_by)     REFERENCES dbo.users(id),
    CONSTRAINT fk_sessions_force_ended_by FOREIGN KEY (force_ended_by)    REFERENCES dbo.users(id),
    CONSTRAINT ck_sessions_status         CHECK (status IN ('scheduled','pending','active','en_route','completed','early_end','absent','overstay','checker_flagged')),
    CONSTRAINT ck_sessions_modality       CHECK (actual_modality IS NULL OR actual_modality IN ('f2f','blended','online')),
    CONSTRAINT ck_sessions_ext_status     CHECK (extension_status IN ('none','pending','approved','denied','timed_out','auto_approved'))
);
CREATE INDEX ix_sessions_date         ON dbo.sessions (session_date);
CREATE INDEX ix_sessions_faculty_date ON dbo.sessions (faculty_id, session_date);
CREATE INDEX ix_sessions_status_live  ON dbo.sessions (status) WHERE status IN ('active','en_route','pending');
GO

CREATE TABLE dbo.en_route_declarations (
    id              UNIQUEIDENTIFIER  NOT NULL CONSTRAINT df_enroute_id          DEFAULT NEWSEQUENTIALID(),
    faculty_id      UNIQUEIDENTIFIER  NOT NULL,
    session_id      UNIQUEIDENTIFIER  NOT NULL,
    eta_minutes     INT               NOT NULL,
    reason          VARCHAR(16)       NOT NULL,
    hold_expires_at DATETIMEOFFSET(3) NOT NULL,
    declared_at     DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_enroute_declared_at DEFAULT SYSDATETIMEOFFSET(),
    cancelled_at    DATETIMEOFFSET(3) NULL,
    cancel_reason   NVARCHAR(512)     NULL,
    warning_sent    BIT               NOT NULL CONSTRAINT df_enroute_warn        DEFAULT 0,
    status          VARCHAR(16)       NOT NULL CONSTRAINT df_enroute_status      DEFAULT 'active',
    CONSTRAINT pk_en_route_declarations PRIMARY KEY (id),
    CONSTRAINT fk_enroute_faculty FOREIGN KEY (faculty_id) REFERENCES dbo.users(id),
    CONSTRAINT fk_enroute_session FOREIGN KEY (session_id) REFERENCES dbo.sessions(id) ON DELETE CASCADE,
    CONSTRAINT ck_enroute_eta     CHECK (eta_minutes BETWEEN 5 AND 60),
    CONSTRAINT ck_enroute_reason  CHECK (reason IN ('current_class','traffic','commute','other')),
    CONSTRAINT ck_enroute_status  CHECK (status IN ('active','expired','cancelled','resolved'))
);
GO

CREATE TABLE dbo.extension_requests (
    id                    UNIQUEIDENTIFIER  NOT NULL CONSTRAINT df_extreq_id           DEFAULT NEWSEQUENTIALID(),
    requesting_session_id UNIQUEIDENTIFIER  NOT NULL,
    incoming_session_id   UNIQUEIDENTIFIER  NULL,
    requested_minutes     INT               NOT NULL,
    status                VARCHAR(16)       NOT NULL CONSTRAINT df_extreq_status       DEFAULT 'pending',
    requested_at          DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_extreq_requested_at DEFAULT SYSDATETIMEOFFSET(),
    response_deadline     DATETIMEOFFSET(3) NULL,
    responded_at          DATETIMEOFFSET(3) NULL,
    responded_by          UNIQUEIDENTIFIER  NULL,
    CONSTRAINT pk_extension_requests   PRIMARY KEY (id),
    CONSTRAINT uq_extreq_requesting    UNIQUE (requesting_session_id),
    CONSTRAINT fk_extreq_requesting    FOREIGN KEY (requesting_session_id) REFERENCES dbo.sessions(id),
    CONSTRAINT fk_extreq_incoming      FOREIGN KEY (incoming_session_id)   REFERENCES dbo.sessions(id),
    CONSTRAINT fk_extreq_responded_by  FOREIGN KEY (responded_by)          REFERENCES dbo.users(id),
    CONSTRAINT ck_extreq_minutes       CHECK (requested_minutes BETWEEN 1 AND 30),
    CONSTRAINT ck_extreq_status        CHECK (status IN ('none','pending','approved','denied','timed_out','auto_approved'))
);
GO

CREATE TABLE dbo.disputes (
    id                    UNIQUEIDENTIFIER  NOT NULL CONSTRAINT df_disputes_id      DEFAULT NEWSEQUENTIALID(),
    session_id            UNIQUEIDENTIFIER  NOT NULL,
    faculty_id            UNIQUEIDENTIFIER  NOT NULL,
    reason_category       VARCHAR(20)       NOT NULL,
    explanation           NVARCHAR(MAX)     NOT NULL,
    evidence_storage_path NVARCHAR(512)     NULL,
    filed_at              DATETIMEOFFSET(3) NOT NULL,
    deadline_at           DATETIMEOFFSET(3) NOT NULL,
    status                VARCHAR(16)       NOT NULL CONSTRAINT df_disputes_status  DEFAULT 'pending',
    reviewed_by           UNIQUEIDENTIFIER  NULL,
    reviewed_at           DATETIMEOFFSET(3) NULL,
    decision_note         NVARCHAR(MAX)     NULL,
    source                VARCHAR(16)       NOT NULL CONSTRAINT df_disputes_source  DEFAULT 'faculty',
    remedial_action       VARCHAR(24)       NULL,
    CONSTRAINT pk_disputes              PRIMARY KEY (id),
    CONSTRAINT fk_disputes_session      FOREIGN KEY (session_id)  REFERENCES dbo.sessions(id),
    CONSTRAINT fk_disputes_faculty      FOREIGN KEY (faculty_id)  REFERENCES dbo.users(id),
    CONSTRAINT fk_disputes_reviewed_by  FOREIGN KEY (reviewed_by) REFERENCES dbo.users(id),
    CONSTRAINT ck_disputes_reason       CHECK (reason_category IN ('wlan_issue','camera_issue','schedule_error','checker_error','other')),
    CONSTRAINT ck_disputes_status       CHECK (status IN ('pending','approved','denied','escalated')),
    CONSTRAINT ck_disputes_source       CHECK (source IN ('faculty','hr_flag')),
    CONSTRAINT ck_disputes_remedial     CHECK (remedial_action IS NULL OR remedial_action IN ('restore_completed','mark_early_end','keep_status','manual_adjust')),
    CONSTRAINT ck_disputes_explanation  CHECK (LEN(explanation) >= 50)
);
CREATE INDEX ix_disputes_status_filed ON dbo.disputes (status, filed_at);
GO

CREATE TABLE dbo.room_handover_conflicts (
    id                    UNIQUEIDENTIFIER  NOT NULL CONSTRAINT df_handover_id DEFAULT NEWSEQUENTIALID(),
    requesting_session_id UNIQUEIDENTIFIER  NOT NULL,
    incoming_session_id   UNIQUEIDENTIFIER  NOT NULL,
    incoming_faculty_id   UNIQUEIDENTIFIER  NOT NULL,
    tapped_at             DATETIMEOFFSET(3) NOT NULL,
    protection_expires_at DATETIMEOFFSET(3) NOT NULL,
    ifo_notified_at       DATETIMEOFFSET(3) NOT NULL,
    resolved_at           DATETIMEOFFSET(3) NULL,
    CONSTRAINT pk_room_handover_conflicts PRIMARY KEY (id),
    CONSTRAINT fk_handover_requesting     FOREIGN KEY (requesting_session_id) REFERENCES dbo.sessions(id),
    CONSTRAINT fk_handover_incoming       FOREIGN KEY (incoming_session_id)   REFERENCES dbo.sessions(id),
    CONSTRAINT fk_handover_faculty        FOREIGN KEY (incoming_faculty_id)   REFERENCES dbo.users(id)
);
GO

/* ──────────────────────────────────────────────────────────────────────────
   §9  attendance: checker_shifts / floors / validations
   ────────────────────────────────────────────────────────────────────────── */
CREATE TABLE dbo.checker_shifts (
    id              UNIQUEIDENTIFIER  NOT NULL CONSTRAINT df_shifts_id        DEFAULT NEWSEQUENTIALID(),
    user_id         UNIQUEIDENTIFIER  NOT NULL,
    role            VARCHAR(16)       NOT NULL,
    shift_date      DATE              NOT NULL,
    scheduled_start TIME(0)           NOT NULL,
    scheduled_end   TIME(0)           NOT NULL,
    actual_start    DATETIMEOFFSET(3) NULL,
    actual_end      DATETIMEOFFSET(3) NULL,
    assigned_by     UNIQUEIDENTIFIER  NOT NULL,
    rooms_validated INT               NOT NULL CONSTRAINT df_shifts_validated DEFAULT 0,
    rooms_skipped   INT               NOT NULL CONSTRAINT df_shifts_skipped   DEFAULT 0,
    note            NVARCHAR(512)     NULL,
    CONSTRAINT pk_checker_shifts     PRIMARY KEY (id),
    CONSTRAINT fk_shifts_user        FOREIGN KEY (user_id)     REFERENCES dbo.users(id),
    CONSTRAINT fk_shifts_assigned_by FOREIGN KEY (assigned_by) REFERENCES dbo.users(id),
    CONSTRAINT ck_shifts_role        CHECK (role IN ('checker','guard')),
    CONSTRAINT ck_shifts_times       CHECK (scheduled_end > scheduled_start)
);
CREATE INDEX ix_shifts_user_date ON dbo.checker_shifts (user_id, shift_date);
GO

CREATE TABLE dbo.checker_shift_floors (
    id           UNIQUEIDENTIFIER NOT NULL CONSTRAINT df_shift_floors_id DEFAULT NEWSEQUENTIALID(),
    shift_id     UNIQUEIDENTIFIER NOT NULL,
    floor_number INT              NOT NULL,
    building     NVARCHAR(64)     NULL,
    CONSTRAINT pk_checker_shift_floors PRIMARY KEY (id),
    CONSTRAINT fk_shift_floors_shift   FOREIGN KEY (shift_id) REFERENCES dbo.checker_shifts(id) ON DELETE CASCADE
);
GO

CREATE TABLE dbo.checker_validations (
    id           UNIQUEIDENTIFIER  NOT NULL CONSTRAINT df_validations_id DEFAULT NEWSEQUENTIALID(),
    session_id   UNIQUEIDENTIFIER  NOT NULL,
    checker_id   UNIQUEIDENTIFIER  NOT NULL,
    action       VARCHAR(24)       NOT NULL,
    note         NVARCHAR(512)     NULL,
    cna_reason   VARCHAR(24)       NULL,
    validated_at DATETIMEOFFSET(3) NOT NULL,
    shift_id     UNIQUEIDENTIFIER  NOT NULL,
    CONSTRAINT pk_checker_validations PRIMARY KEY (id),
    CONSTRAINT fk_val_session    FOREIGN KEY (session_id) REFERENCES dbo.sessions(id),
    CONSTRAINT fk_val_checker    FOREIGN KEY (checker_id) REFERENCES dbo.users(id),
    CONSTRAINT fk_val_shift      FOREIGN KEY (shift_id)   REFERENCES dbo.checker_shifts(id),
    CONSTRAINT ck_val_action     CHECK (action IN ('verified','flagged_absent','could_not_access')),
    CONSTRAINT ck_val_cna_reason CHECK (cna_reason IS NULL OR cna_reason IN ('room_locked','restricted_access','room_not_found','other'))
);
CREATE INDEX ix_val_session ON dbo.checker_validations (session_id);
GO

/* ──────────────────────────────────────────────────────────────────────────
   §10  assist_requests
   ────────────────────────────────────────────────────────────────────────── */
CREATE TABLE dbo.assist_requests (
    id                       UNIQUEIDENTIFIER  NOT NULL CONSTRAINT df_assist_id      DEFAULT NEWSEQUENTIALID(),
    faculty_id               UNIQUEIDENTIFIER  NOT NULL,
    room_id                  UNIQUEIDENTIFIER  NOT NULL,
    session_id               UNIQUEIDENTIFIER  NULL,
    assist_types             NVARCHAR(255)     NOT NULL,
    note                     NVARCHAR(MAX)     NULL,
    sent_at                  DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_assist_sent_at DEFAULT SYSDATETIMEOFFSET(),
    ifo_acknowledged_by      UNIQUEIDENTIFIER  NULL,
    ifo_acknowledged_at      DATETIMEOFFSET(3) NULL,
    guard_acknowledged_by    UNIQUEIDENTIFIER  NULL,
    guard_acknowledged_at    DATETIMEOFFSET(3) NULL,
    guard_incident_note      NVARCHAR(MAX)     NULL,
    guard_resolution_status  VARCHAR(24)       NULL,
    guard_incident_logged_at DATETIMEOFFSET(3) NULL,
    escalated_at             DATETIMEOFFSET(3) NULL,
    CONSTRAINT pk_assist_requests           PRIMARY KEY (id),
    CONSTRAINT fk_assist_faculty            FOREIGN KEY (faculty_id)            REFERENCES dbo.users(id),
    CONSTRAINT fk_assist_room               FOREIGN KEY (room_id)               REFERENCES dbo.rooms(id),
    CONSTRAINT fk_assist_session            FOREIGN KEY (session_id)            REFERENCES dbo.sessions(id),
    CONSTRAINT fk_assist_ifo_ack_by         FOREIGN KEY (ifo_acknowledged_by)   REFERENCES dbo.users(id),
    CONSTRAINT fk_assist_guard_ack_by       FOREIGN KEY (guard_acknowledged_by) REFERENCES dbo.users(id),
    CONSTRAINT ck_assist_guard_resolution   CHECK (guard_resolution_status IS NULL OR guard_resolution_status IN ('resolved_onsite','referred_ifo','referred_external','no_issue','other'))
);
CREATE INDEX ix_assist_room_sent ON dbo.assist_requests (room_id, sent_at DESC);
GO

/* ──────────────────────────────────────────────────────────────────────────
   §11  manual_bookings
   ────────────────────────────────────────────────────────────────────────── */
CREATE TABLE dbo.manual_bookings (
    id                  UNIQUEIDENTIFIER  NOT NULL CONSTRAINT df_bookings_id      DEFAULT NEWSEQUENTIALID(),
    room_id             UNIQUEIDENTIFIER  NOT NULL,
    booked_by           UNIQUEIDENTIFIER  NOT NULL,
    occupant_name       NVARCHAR(255)     NOT NULL,
    purpose             NVARCHAR(MAX)     NULL,
    start_datetime      DATETIMEOFFSET(3) NOT NULL,
    end_datetime        DATETIMEOFFSET(3) NOT NULL,
    contact_info        NVARCHAR(255)     NULL,
    status              VARCHAR(16)       NOT NULL CONSTRAINT df_bookings_status  DEFAULT 'active',
    cancelled_at        DATETIMEOFFSET(3) NULL,
    cancellation_reason NVARCHAR(512)     NULL,
    created_at          DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_bookings_created DEFAULT SYSDATETIMEOFFSET(),
    CONSTRAINT pk_manual_bookings    PRIMARY KEY (id),
    CONSTRAINT fk_bookings_room      FOREIGN KEY (room_id)   REFERENCES dbo.rooms(id),
    CONSTRAINT fk_bookings_booked_by FOREIGN KEY (booked_by) REFERENCES dbo.users(id),
    CONSTRAINT ck_bookings_status    CHECK (status IN ('active','cancelled')),
    CONSTRAINT ck_bookings_time      CHECK (end_datetime > start_datetime)
);
CREATE INDEX ix_bookings_room_time ON dbo.manual_bookings (room_id, start_datetime);
GO

/* ──────────────────────────────────────────────────────────────────────────
   §12  notifications / notification_preferences
   ────────────────────────────────────────────────────────────────────────── */
CREATE TABLE dbo.notifications (
    id             UNIQUEIDENTIFIER  NOT NULL CONSTRAINT df_notif_id      DEFAULT NEWSEQUENTIALID(),
    recipient_id   UNIQUEIDENTIFIER  NOT NULL,
    event_type     VARCHAR(64)       NOT NULL,
    title          NVARCHAR(255)     NOT NULL,
    body           NVARCHAR(MAX)     NOT NULL,
    reference_id   UNIQUEIDENTIFIER  NULL,
    reference_type VARCHAR(64)       NULL,
    delivered_via  VARCHAR(8)        NOT NULL CONSTRAINT df_notif_via     DEFAULT 'in_app',
    read_at        DATETIMEOFFSET(3) NULL,
    created_at     DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_notif_created DEFAULT SYSDATETIMEOFFSET(),
    CONSTRAINT pk_notifications       PRIMARY KEY (id),
    CONSTRAINT fk_notif_recipient     FOREIGN KEY (recipient_id) REFERENCES dbo.users(id),
    CONSTRAINT ck_notif_delivered_via CHECK (delivered_via IN ('push','in_app','both'))
);
CREATE INDEX ix_notif_recipient_created ON dbo.notifications (recipient_id, created_at DESC);
CREATE INDEX ix_notif_unread             ON dbo.notifications (recipient_id) WHERE read_at IS NULL;
GO

CREATE TABLE dbo.notification_preferences (
    user_id        UNIQUEIDENTIFIER  NOT NULL,
    event_type     VARCHAR(64)       NOT NULL,
    push_enabled   BIT               NOT NULL CONSTRAINT df_pref_push    DEFAULT 1,
    in_app_enabled BIT               NOT NULL CONSTRAINT df_pref_in_app  DEFAULT 1,
    updated_at     DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_pref_updated DEFAULT SYSDATETIMEOFFSET(),
    CONSTRAINT pk_notification_preferences PRIMARY KEY (user_id, event_type),
    CONSTRAINT fk_pref_user                FOREIGN KEY (user_id) REFERENCES dbo.users(id) ON DELETE CASCADE
);
GO

/* ──────────────────────────────────────────────────────────────────────────
   §13  user_devices
   ────────────────────────────────────────────────────────────────────────── */
CREATE TABLE dbo.user_devices (
    id           UNIQUEIDENTIFIER  NOT NULL CONSTRAINT df_devices_id      DEFAULT NEWSEQUENTIALID(),
    user_id      UNIQUEIDENTIFIER  NOT NULL,
    name         NVARCHAR(255)     NOT NULL,
    mac_hint     VARCHAR(64)       NULL,
    device_type  VARCHAR(16)       NOT NULL CONSTRAINT df_devices_type    DEFAULT 'laptop',
    is_primary   BIT               NOT NULL CONSTRAINT df_devices_primary DEFAULT 0,
    is_active    BIT               NOT NULL CONSTRAINT df_devices_active  DEFAULT 1,
    last_seen_at DATETIMEOFFSET(3) NULL,
    created_at   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_devices_created DEFAULT SYSDATETIMEOFFSET(),
    updated_at   DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_devices_updated DEFAULT SYSDATETIMEOFFSET(),
    CONSTRAINT pk_user_devices PRIMARY KEY (id),
    CONSTRAINT fk_devices_user FOREIGN KEY (user_id) REFERENCES dbo.users(id) ON DELETE CASCADE,
    CONSTRAINT ck_devices_type CHECK (device_type IN ('laptop','tablet','phone','desktop','other'))
);
CREATE INDEX ix_devices_user_active ON dbo.user_devices (user_id) WHERE is_active = 1;
GO

/* ──────────────────────────────────────────────────────────────────────────
   §14  audit_log (append-only)
   ────────────────────────────────────────────────────────────────────────── */
CREATE TABLE dbo.audit_log (
    id          UNIQUEIDENTIFIER  NOT NULL CONSTRAINT df_audit_id      DEFAULT NEWSEQUENTIALID(),
    event_type  VARCHAR(64)       NOT NULL,
    actor_id    UNIQUEIDENTIFIER  NULL,
    target_type VARCHAR(64)       NULL,
    target_id   UNIQUEIDENTIFIER  NULL,
    payload     NVARCHAR(MAX)     NULL,
    ip_address  VARCHAR(45)       NULL,
    created_at  DATETIMEOFFSET(3) NOT NULL CONSTRAINT df_audit_created DEFAULT SYSDATETIMEOFFSET(),
    CONSTRAINT pk_audit_log          PRIMARY KEY (id),
    CONSTRAINT fk_audit_actor        FOREIGN KEY (actor_id) REFERENCES dbo.users(id),
    CONSTRAINT ck_audit_payload_json CHECK (payload IS NULL OR ISJSON(payload) = 1)
);
CREATE INDEX ix_audit_created ON dbo.audit_log (created_at DESC);
CREATE INDEX ix_audit_target  ON dbo.audit_log (target_type, target_id);
GO

/* ============================================================================
   §15  Overlap-check triggers
   Replaces the two Postgres GIST `EXCLUDE USING gist` constraints.
   ============================================================================ */

/* schedules: no two active schedules in the same section may overlap on the
   same day-of-week. Half-open interval [start_time, end_time). */
IF OBJECT_ID('dbo.trg_schedules_no_section_overlap', 'TR') IS NOT NULL
    DROP TRIGGER dbo.trg_schedules_no_section_overlap;
GO
CREATE TRIGGER dbo.trg_schedules_no_section_overlap
ON dbo.schedules
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (
        SELECT 1
        FROM inserted i
        JOIN dbo.schedules s
          ON s.id          <> i.id
         AND s.section_id   = i.section_id
         AND s.day_of_week  = i.day_of_week
         AND s.is_active    = 1
         AND s.section_id   IS NOT NULL
         AND i.is_active    = 1
         AND i.section_id   IS NOT NULL
         AND s.start_time   < i.end_time
         AND i.start_time   < s.end_time
    )
    BEGIN
        ROLLBACK TRANSACTION;
        THROW 50001, 'Section already has an overlapping schedule on this day and time window.', 1;
    END
END;
GO

/* payroll_periods: no two periods may have overlapping inclusive date ranges. */
IF OBJECT_ID('dbo.trg_payroll_periods_no_overlap', 'TR') IS NOT NULL
    DROP TRIGGER dbo.trg_payroll_periods_no_overlap;
GO
CREATE TRIGGER dbo.trg_payroll_periods_no_overlap
ON dbo.payroll_periods
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (
        SELECT 1
        FROM inserted i
        JOIN dbo.payroll_periods p
          ON p.id <> i.id
         AND p.date_from <= i.date_to
         AND i.date_from <= p.date_to
    )
    BEGIN
        ROLLBACK TRANSACTION;
        THROW 50002, 'Payroll period overlaps an existing one.', 1;
    END
END;
GO

/* ============================================================================
   §16  Touch updated_at triggers
   Replaces Postgres tg_set_updated_at / touch_user_devices_updated_at.
   ============================================================================ */
IF OBJECT_ID('dbo.trg_sessions_touch_updated_at', 'TR') IS NOT NULL
    DROP TRIGGER dbo.trg_sessions_touch_updated_at;
GO
CREATE TRIGGER dbo.trg_sessions_touch_updated_at
ON dbo.sessions
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE s SET updated_at = SYSDATETIMEOFFSET()
      FROM dbo.sessions s
      JOIN inserted i ON s.id = i.id;
END;
GO

IF OBJECT_ID('dbo.trg_devices_touch_updated_at', 'TR') IS NOT NULL
    DROP TRIGGER dbo.trg_devices_touch_updated_at;
GO
CREATE TRIGGER dbo.trg_devices_touch_updated_at
ON dbo.user_devices
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE d SET updated_at = SYSDATETIMEOFFSET()
      FROM dbo.user_devices d
      JOIN inserted i ON d.id = i.id;
END;
GO

/* ============================================================================
   §17  Block edits to sessions belonging to a locked payroll period
   Replaces Postgres tg_block_locked_session_update.
   ============================================================================ */
IF OBJECT_ID('dbo.trg_sessions_block_locked_update', 'TR') IS NOT NULL
    DROP TRIGGER dbo.trg_sessions_block_locked_update;
GO
CREATE TRIGGER dbo.trg_sessions_block_locked_update
ON dbo.sessions
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (
        SELECT 1
        FROM inserted i
        JOIN dbo.payroll_periods p ON p.id = i.payroll_period_id
        WHERE p.lock_stage IN ('hard','archived')
    )
    BEGIN
        ROLLBACK TRANSACTION;
        THROW 50003, 'Session belongs to a hard-locked payroll period and cannot be modified.', 1;
    END
END;
GO

/* ============================================================================
   §18  Maintain payroll_periods.open_disputes_count
   Replaces Postgres tg_disputes_maintain_period_count.
   ============================================================================ */
IF OBJECT_ID('dbo.trg_disputes_maintain_period_count', 'TR') IS NOT NULL
    DROP TRIGGER dbo.trg_disputes_maintain_period_count;
GO
CREATE TRIGGER dbo.trg_disputes_maintain_period_count
ON dbo.disputes
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    /* Affected payroll periods, derived through sessions.payroll_period_id */
    DECLARE @periods TABLE (id UNIQUEIDENTIFIER PRIMARY KEY);
    INSERT INTO @periods (id)
    SELECT DISTINCT s.payroll_period_id
    FROM dbo.sessions s
    WHERE s.payroll_period_id IS NOT NULL
      AND s.id IN (
          SELECT session_id FROM inserted
          UNION SELECT session_id FROM deleted
      );

    UPDATE p
       SET open_disputes_count = (
           SELECT COUNT(*)
           FROM dbo.disputes d
           JOIN dbo.sessions s ON s.id = d.session_id
           WHERE s.payroll_period_id = p.id
             AND d.status = 'pending'
       )
      FROM dbo.payroll_periods p
     WHERE p.id IN (SELECT id FROM @periods);
END;
GO

/* ============================================================================
   §19  Smoke-test queries
   Run after the ETL completes to validate the load. Compare against Postgres.
   ============================================================================ */
-- SELECT 'users'         AS t, COUNT(*) FROM dbo.users
-- UNION ALL SELECT 'rooms',                COUNT(*) FROM dbo.rooms
-- UNION ALL SELECT 'schedules',            COUNT(*) FROM dbo.schedules
-- UNION ALL SELECT 'sessions',             COUNT(*) FROM dbo.sessions
-- UNION ALL SELECT 'disputes',             COUNT(*) FROM dbo.disputes
-- UNION ALL SELECT 'audit_log',            COUNT(*) FROM dbo.audit_log;
--
-- SELECT status, COUNT(*) FROM dbo.sessions GROUP BY status;
--
-- /* Orphan-FK probe: should return 0 */
-- SELECT COUNT(*) AS orphan_sessions
-- FROM dbo.sessions s
-- LEFT JOIN dbo.schedules sc ON sc.id = s.schedule_id
-- WHERE sc.id IS NULL;
