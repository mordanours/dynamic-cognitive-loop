from __future__ import annotations

import json
import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.db.database import get_conn, new_id
from app.services.auth import get_current_user

router = APIRouter(prefix="/api/domains", tags=["domains"])

STARTER_L1_SCHEMA = {
    "type": "object",
    "required": ["concept", "analogy", "boundary_note"],
    "properties": {
        "concept": {"type": "string", "title": "核心概念"},
        "analogy": {"type": "string", "title": "类比与直觉"},
        "boundary_note": {"type": "string", "title": "适用边界与误区"},
    },
    "additionalProperties": False,
}


class CreateDomainRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=32)
    description: str = Field(default="", max_length=120)
    color: str = "indigo"


class UpdateDomainRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=32)
    description: str | None = Field(default=None, max_length=120)
    color: str | None = None
    is_archived: int | None = None


def _slugify(name: str) -> str:
    ascii_part = re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")
    if ascii_part and len(ascii_part) >= 2:
        return ascii_part[:24]
    return new_id("dom")


@router.get("")
def list_domains(
    include_archived: bool = False,
    current_user: dict = Depends(get_current_user),
) -> list[dict]:
    with get_conn() as conn:
        if include_archived:
            rows = conn.execute(
                "SELECT * FROM user_domains WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC",
                (current_user["id"],),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM user_domains WHERE user_id = ? AND is_archived = 0 ORDER BY sort_order ASC, created_at ASC",
                (current_user["id"],),
            ).fetchall()
    return [dict(r) for r in rows]


@router.post("")
def create_domain(
    req: CreateDomainRequest,
    current_user: dict = Depends(get_current_user),
) -> dict:
    user_id = current_user["id"]
    clean_name = req.name.strip()
    slug = _slugify(clean_name)

    with get_conn() as conn:
        existing_slug = conn.execute(
            "SELECT id FROM user_domains WHERE user_id = ? AND slug = ?",
            (user_id, slug),
        ).fetchone()
        if existing_slug:
            slug = f"{slug}_{new_id('')[:4]}"

        dom_id = new_id("dom")
        conn.execute(
            """
            INSERT INTO user_domains (id, user_id, slug, name, description, color, sort_order)
            VALUES (?, ?, ?, ?, ?, ?, 10)
            """,
            (dom_id, user_id, slug, clean_name, req.description.strip(), req.color),
        )
        # Seed fixed '核心认知' Level-1 folder
        conn.execute(
            """
            INSERT OR IGNORE INTO domain_folders (id, user_id, domain_slug, folder_name, parent_id, is_system)
            VALUES (?, ?, ?, '核心认知', NULL, 1)
            """,
            (new_id("fld"), user_id, slug),
        )
        # Seed starter L1 schema for the new domain
        conn.execute(
            """
            INSERT OR IGNORE INTO domain_schemas
            (id, user_id, domain_slug, domain_name, version, mastery_tier, json_schema, rationale, is_active)
            VALUES (?, ?, ?, ?, 1, 1, ?, '自定义领域初始 L1 结构', 1)
            """,
            (
                f"schema_{user_id}_{slug}_v1",
                user_id,
                slug,
                clean_name,
                json.dumps(STARTER_L1_SCHEMA, ensure_ascii=False),
            ),
        )
        row = conn.execute("SELECT * FROM user_domains WHERE id = ?", (dom_id,)).fetchone()
    return dict(row)


@router.patch("/{slug}")
def update_domain(
    slug: str,
    req: UpdateDomainRequest,
    current_user: dict = Depends(get_current_user),
) -> dict:
    user_id = current_user["id"]
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM user_domains WHERE user_id = ? AND slug = ?",
            (user_id, slug),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="未找到该认知领域")
        new_name = req.name.strip() if req.name is not None else row["name"]
        new_desc = req.description.strip() if req.description is not None else row["description"]
        new_color = req.color if req.color is not None else row["color"]
        new_arch = req.is_archived if req.is_archived is not None else row["is_archived"]

        conn.execute(
            """
            UPDATE user_domains
            SET name = ?, description = ?, color = ?, is_archived = ?
            WHERE user_id = ? AND slug = ?
            """,
            (new_name, new_desc, new_color, new_arch, user_id, slug),
        )
        if req.name is not None:
            conn.execute(
                "UPDATE domain_schemas SET domain_name = ? WHERE user_id = ? AND domain_slug = ?",
                (new_name, user_id, slug),
            )
        updated = conn.execute(
            "SELECT * FROM user_domains WHERE user_id = ? AND slug = ?",
            (user_id, slug),
        ).fetchone()
    return dict(updated)
