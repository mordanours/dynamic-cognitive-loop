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
    """Rough token estimator suitable for mixed Chinese/English text."""
    if not text:
        return 0
    # Average ~1.5 chars per token for mixed CJK/English
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
    """Safe additive migrations for existing Phase 1 SQLite databases."""
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

    # Backfill empty folder_path / short_keyword for existing nodes
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


def _seed_initial_data(conn: sqlite3.Connection) -> None:
    for s in SEED_SCHEMAS:
        conn.execute(
            """
            INSERT OR IGNORE INTO domain_schemas
            (id, domain_slug, domain_name, version, mastery_tier, json_schema, rationale, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                s["id"],
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
        "SELECT id FROM user_profile WHERE id = 'default'"
    ).fetchone()
    if not existing_profile:
        conn.execute(
            "INSERT INTO user_profile (id, profile_json) VALUES ('default', ?)",
            (json.dumps(DEFAULT_USER_PROFILE, ensure_ascii=False),),
        )

    # Seed fixed system subfolder '核心认知' for each domain
    for domain_slug in ("investing", "learning"):
        conn.execute(
            """
            INSERT OR IGNORE INTO domain_folders (id, domain_slug, folder_name, is_system)
            VALUES (?, ?, '核心认知', 1)
            """,
            (f"fld_{domain_slug}_core", domain_slug),
        )
