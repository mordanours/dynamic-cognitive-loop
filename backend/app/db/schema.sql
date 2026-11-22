PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS stream_items (
    id              TEXT PRIMARY KEY,
    source          TEXT NOT NULL DEFAULT 'chat_paste',
    domain_hint     TEXT NOT NULL DEFAULT 'investing',
    raw_content     TEXT NOT NULL,
    token_count     INTEGER NOT NULL,
    salience_score  REAL NOT NULL DEFAULT 1.0,
    status          TEXT NOT NULL DEFAULT 'inbox',
    ttl_days        INTEGER NOT NULL DEFAULT 7,
    expires_at      DATETIME NOT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS domain_schemas (
    id              TEXT PRIMARY KEY,
    domain_slug     TEXT NOT NULL,
    domain_name     TEXT NOT NULL,
    version         INTEGER NOT NULL,
    mastery_tier    INTEGER NOT NULL,
    json_schema     TEXT NOT NULL,
    ui_hints_json   TEXT,
    rationale       TEXT,
    is_active       INTEGER NOT NULL DEFAULT 1,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(domain_slug, version)
);

CREATE TABLE IF NOT EXISTS crystallized_nodes (
    id                  TEXT PRIMARY KEY,
    domain_slug         TEXT NOT NULL,
    schema_version      INTEGER NOT NULL,
    node_type           TEXT NOT NULL DEFAULT 'decision', -- 'knowledge' | 'decision'
    folder_path         TEXT NOT NULL DEFAULT '',         -- 如 'investing/仓位与择时'
    short_keyword       TEXT NOT NULL DEFAULT '',         -- 知识类用名词短语，决策类用动词短语
    title               TEXT NOT NULL,
    atomic_claim        TEXT NOT NULL,
    payload_json        TEXT NOT NULL,
    confidence          REAL NOT NULL DEFAULT 0.6,
    conversion_weight   REAL NOT NULL DEFAULT 0.5,
    status              TEXT NOT NULL DEFAULT 'active',
    source_stream_ids   TEXT NOT NULL,
    discarded_noise     TEXT,
    compression_ratio   REAL,
    fsrs_state_json     TEXT,
    next_review_at      DATETIME,
    needs_verification  INTEGER NOT NULL DEFAULT 0,
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS node_edges (
    source_id       TEXT NOT NULL,
    target_id       TEXT NOT NULL,
    relation_type   TEXT NOT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (source_id, target_id, relation_type)
);

CREATE TABLE IF NOT EXISTS action_experiments (
    id                  TEXT PRIMARY KEY,
    node_id             TEXT NOT NULL REFERENCES crystallized_nodes(id) ON DELETE CASCADE,
    theoretical_basis   TEXT NOT NULL DEFAULT '',
    hypothesis          TEXT NOT NULL,
    trigger_condition   TEXT NOT NULL,
    micro_action        TEXT NOT NULL,
    success_metric      TEXT NOT NULL,
    bandwidth_cost      TEXT NOT NULL DEFAULT 'low',
    status              TEXT NOT NULL DEFAULT 'proposed',
    check_in_at         DATETIME,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id                      TEXT PRIMARY KEY,
    action_id               TEXT NOT NULL REFERENCES action_experiments(id) ON DELETE CASCADE,
    executed                INTEGER NOT NULL,
    outcome_score           INTEGER NOT NULL,
    friction_tag            TEXT NOT NULL DEFAULT 'none',
    user_reflection         TEXT,
    calibration_delta_json  TEXT NOT NULL,
    created_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_profile (
    id              TEXT PRIMARY KEY,
    profile_json    TEXT NOT NULL,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS profile_signals (
    id              TEXT PRIMARY KEY,
    signal_type     TEXT NOT NULL,
    domain_slug     TEXT,
    payload_json    TEXT NOT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS architect_proposals (
    id                      TEXT PRIMARY KEY,
    domain_slug             TEXT NOT NULL,
    proposal_type           TEXT NOT NULL, -- 'merge_duplicates' | 'deprecate_low_utility' | 'evolve_schema'
    target_node_ids_json    TEXT NOT NULL,
    proposed_node_json      TEXT,
    rationale               TEXT NOT NULL,
    status                  TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected'
    created_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS socratic_logs (
    id                      TEXT PRIMARY KEY,
    node_id                 TEXT NOT NULL REFERENCES crystallized_nodes(id) ON DELETE CASCADE,
    difficulty              TEXT NOT NULL DEFAULT 'medium',
    question                TEXT NOT NULL,
    user_answer             TEXT NOT NULL,
    rating                  INTEGER NOT NULL,
    feedback                TEXT NOT NULL,
    blind_spot_note         TEXT DEFAULT '',
    card_evolution_note     TEXT DEFAULT '',
    created_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS domain_folders (
    id              TEXT PRIMARY KEY,
    domain_slug     TEXT NOT NULL,
    folder_name     TEXT NOT NULL,
    is_system       INTEGER NOT NULL DEFAULT 0, -- 1 for fixed '核心认知'
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(domain_slug, folder_name)
);
