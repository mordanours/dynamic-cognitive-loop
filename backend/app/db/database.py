from __future__ import annotations

import json
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator

from app.config import DB_PATH, ensure_dirs
from app.db.seed_schemas import DEFAULT_USER_PROFILE, SEED_SCHEMAS

SCHEMA_SQL_PATH = Path(__file__).resolve().parent / "schema.sql"


def new_id(prefix: str = "") -> str:
    uid = uuid.uuid4().hex[:12]
    return f"{prefix}_{uid}" if prefix else uid


def estimate_tokens(text: str) -> int:
    if not text:
        return 0
    return max(1, int(len(text) / 1.5))


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@contextmanager
def get_conn() -> Iterator[sqlite3.Connection]:
    ensure_dirs()
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db() -> None:
    ensure_dirs()
    schema_sql = SCHEMA_SQL_PATH.read_text(encoding="utf-8")
    with get_conn() as conn:
        conn.executescript(schema_sql)
        _run_migrations(conn)
        _seed_initial_data(conn)


def _run_migrations(conn: sqlite3.Connection) -> None:
    """Safe additive migrations for existing Phase 1-3 SQLite databases."""
    node_cols = {
        row["name"]
        for row in conn.execute("PRAGMA table_info(crystallized_nodes)").fetchall()
    }
    if "node_type" not in node_cols:
        conn.execute(
            "ALTER TABLE crystallized_nodes ADD COLUMN node_type TEXT NOT NULL DEFAULT 'decision'"
        )
    if "folder_path" not in node_cols:
        conn.execute(
            "ALTER TABLE crystallized_nodes ADD COLUMN folder_path TEXT NOT NULL DEFAULT ''"
        )
    if "short_keyword" not in node_cols:
        conn.execute(
            "ALTER TABLE crystallized_nodes ADD COLUMN short_keyword TEXT NOT NULL DEFAULT ''"
        )

    action_cols = {
        row["name"]
        for row in conn.execute("PRAGMA table_info(action_experiments)").fetchall()
    }
    if "theoretical_basis" not in action_cols:
        conn.execute(
            "ALTER TABLE action_experiments ADD COLUMN theoretical_basis TEXT NOT NULL DEFAULT ''"
        )

    # Multi-tenant user_id additive migration on all business tables
    for table in (
        "stream_items",
        "domain_schemas",
        "crystallized_nodes",
        "action_experiments",
        "audit_logs",
        "profile_signals",
        "architect_proposals",
        "socratic_logs",
        "domain_folders",
    ):
        cols = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}
        if "user_id" not in cols:
            conn.execute(
                f"ALTER TABLE {table} ADD COLUMN user_id TEXT NOT NULL DEFAULT 'usr_default'"
            )

    # Migrate legacy 'default' user_profile row to 'usr_default'
    legacy_prof = conn.execute(
        "SELECT profile_json FROM user_profile WHERE id = 'default'"
    ).fetchone()
    usr_prof = conn.execute(
        "SELECT id FROM user_profile WHERE id = 'usr_default'"
    ).fetchone()
    if legacy_prof and not usr_prof:
        conn.execute(
            "INSERT INTO user_profile (id, profile_json) VALUES ('usr_default', ?)",
            (legacy_prof["profile_json"],),
        )
        conn.execute("DELETE FROM user_profile WHERE id = 'default'")

    # Backfill empty folder_path / short_keyword
    conn.execute(
        """
        UPDATE crystallized_nodes
        SET folder_path = domain_slug || '/核心认知'
        WHERE folder_path = ''
        """
    )
    conn.execute(
        """
        UPDATE crystallized_nodes
        SET short_keyword = substr(title, 1, 16)
        WHERE short_keyword = ''
        """
    )


def seed_user_defaults(conn: sqlite3.Connection, user_id: str) -> None:
    """Ensure a user has their own starter schemas, profile, and fixed system folders."""
    for s in SEED_SCHEMAS:
        schema_id = s["id"] if user_id == "usr_default" else f"{s['id']}_{user_id}"
        conn.execute(
            """
            INSERT OR IGNORE INTO domain_schemas
            (id, user_id, domain_slug, domain_name, version, mastery_tier, json_schema, rationale, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                schema_id,
                user_id,
                s["domain_slug"],
                s["domain_name"],
                s["version"],
                s["mastery_tier"],
                json.dumps(s["json_schema"], ensure_ascii=False),
                s["rationale"],
                s["is_active"],
            ),
        )

    existing_profile = conn.execute(
        "SELECT id FROM user_profile WHERE id = ?", (user_id,)
    ).fetchone()
    if not existing_profile:
        conn.execute(
            "INSERT INTO user_profile (id, profile_json) VALUES (?, ?)",
            (user_id, json.dumps(DEFAULT_USER_PROFILE, ensure_ascii=False)),
        )

    for domain_slug in ("investing", "learning"):
        fld_id = (
            f"fld_{domain_slug}_core"
            if user_id == "usr_default"
            else f"fld_{domain_slug}_core_{user_id}"
        )
        conn.execute(
            """
            INSERT OR IGNORE INTO domain_folders (id, user_id, domain_slug, folder_name, is_system)
            VALUES (?, ?, ?, '核心认知', 1)
            """,
            (fld_id, user_id, domain_slug),
        )


def _seed_initial_data(conn: sqlite3.Connection) -> None:
    conn.execute(
        "INSERT OR IGNORE INTO users (id, nickname, role, is_active) VALUES ('usr_default', 'Admin', 'admin', 1)"
    )
    seed_user_defaults(conn, "usr_default")
