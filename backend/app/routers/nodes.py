from __future__ import annotations

import json
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.agents.distiller import distill_stream_item
from app.db.database import get_conn, new_id
from app.db.md_mirror import export_node_markdown
from app.services.auth import get_current_user
from app.services.llm_client import LLMConfigError

router = APIRouter(prefix="/api/nodes", tags=["nodes"])


class DistillRequest(BaseModel):
    stream_id: str
    domain_slug: Literal["investing", "learning"] | None = None


class CreateFolderRequest(BaseModel):
    domain_slug: Literal["investing", "learning"]
    folder_name: str = Field(..., min_length=1, max_length=32)


class RenameFolderRequest(BaseModel):
    domain_slug: Literal["investing", "learning"]
    old_name: str = Field(..., min_length=1, max_length=32)
    new_name: str = Field(..., min_length=1, max_length=32)


class MoveNodeFolderRequest(BaseModel):
    folder_name: str = Field(..., min_length=1, max_length=32)


@router.post("/distill")
async def distill_endpoint(
    req: DistillRequest,
    current_user: dict = Depends(get_current_user),
) -> dict:
    try:
        return await distill_stream_item(
            req.stream_id, req.domain_slug, user_id=current_user["id"]
        )
    except LLMConfigError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"降维提炼失败: {exc}") from exc


@router.get("")
def list_nodes(
    domain_slug: str | None = None,
    include_archived: bool = False,
    current_user: dict = Depends(get_current_user),
) -> list[dict]:
    with get_conn() as conn:
        where_clauses = ["user_id = ?"]
        params: list[str] = [current_user["id"]]
        if domain_slug:
            where_clauses.append("domain_slug = ?")
            params.append(domain_slug)
        if not include_archived:
            where_clauses.append("status NOT IN ('merged', 'deprecated')")
        where_sql = " WHERE " + " AND ".join(where_clauses)
        rows = conn.execute(
            f"SELECT * FROM crystallized_nodes{where_sql} ORDER BY conversion_weight DESC, created_at DESC",
            tuple(params),
        ).fetchall()
    result = []
    for r in rows:
        d = dict(r)
        d["payload"] = json.loads(d["payload_json"])
        result.append(d)
    return result


@router.get("/schemas")
def list_domain_schemas(current_user: dict = Depends(get_current_user)) -> list[dict]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM domain_schemas WHERE user_id = ? ORDER BY domain_slug, version",
            (current_user["id"],),
        ).fetchall()
    result = []
    for r in rows:
        d = dict(r)
        d["json_schema_obj"] = json.loads(d["json_schema"])
        result.append(d)
    return result


@router.get("/folders")
def list_folders(
    domain_slug: str | None = None,
    current_user: dict = Depends(get_current_user),
) -> list[dict]:
    user_id = current_user["id"]
    with get_conn() as conn:
        if domain_slug:
            rows = conn.execute(
                "SELECT * FROM domain_folders WHERE user_id = ? AND domain_slug = ? ORDER BY is_system DESC, created_at ASC",
                (user_id, domain_slug),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM domain_folders WHERE user_id = ? ORDER BY domain_slug, is_system DESC, created_at ASC",
                (user_id,),
            ).fetchall()
    return [dict(r) for r in rows]


@router.post("/folders")
def create_folder(
    req: CreateFolderRequest,
    current_user: dict = Depends(get_current_user),
) -> dict:
    user_id = current_user["id"]
    clean_name = req.folder_name.strip().replace("/", "_")
    if not clean_name:
        raise HTTPException(status_code=400, detail="目录名不能为空")
    with get_conn() as conn:
        exists = conn.execute(
            "SELECT id FROM domain_folders WHERE user_id = ? AND domain_slug = ? AND folder_name = ?",
            (user_id, req.domain_slug, clean_name),
        ).fetchone()
        if exists:
            raise HTTPException(status_code=400, detail=f"目录 '{clean_name}' 已存在")
        fid = new_id("fld")
        conn.execute(
            "INSERT INTO domain_folders (id, user_id, domain_slug, folder_name, is_system) VALUES (?, ?, ?, ?, 0)",
            (fid, user_id, req.domain_slug, clean_name),
        )
        row = conn.execute("SELECT * FROM domain_folders WHERE id = ?", (fid,)).fetchone()
    return dict(row)


@router.patch("/folders")
def rename_folder(
    req: RenameFolderRequest,
    current_user: dict = Depends(get_current_user),
) -> dict:
    user_id = current_user["id"]
    old_clean = req.old_name.strip()
    new_clean = req.new_name.strip().replace("/", "_")
    if old_clean == "核心认知":
        raise HTTPException(status_code=400, detail="系统固定目录「核心认知」不可重命名")
    if not new_clean:
        raise HTTPException(status_code=400, detail="新目录名不能为空")
    with get_conn() as conn:
        conn.execute(
            "UPDATE domain_folders SET folder_name = ? WHERE user_id = ? AND domain_slug = ? AND folder_name = ? AND is_system = 0",
            (new_clean, user_id, req.domain_slug, old_clean),
        )
        old_path = f"{req.domain_slug}/{old_clean}"
        new_path = f"{req.domain_slug}/{new_clean}"
        conn.execute(
            "UPDATE crystallized_nodes SET folder_path = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND folder_path = ?",
            (new_path, user_id, old_path),
        )
    return {"domain_slug": req.domain_slug, "old_name": old_clean, "new_name": new_clean}


@router.patch("/{node_id}/folder")
def move_node_folder(
    node_id: str,
    req: MoveNodeFolderRequest,
    current_user: dict = Depends(get_current_user),
) -> dict:
    user_id = current_user["id"]
    clean_folder = req.folder_name.strip().replace("/", "_")
    with get_conn() as conn:
        node = conn.execute(
            "SELECT * FROM crystallized_nodes WHERE id = ? AND user_id = ?",
            (node_id, user_id),
        ).fetchone()
        if not node:
            raise HTTPException(status_code=404, detail="未找到卡片")
        conn.execute(
            "INSERT OR IGNORE INTO domain_folders (id, user_id, domain_slug, folder_name, is_system) VALUES (?, ?, ?, ?, 0)",
            (new_id("fld"), user_id, node["domain_slug"], clean_folder),
        )
        new_path = f"{node['domain_slug']}/{clean_folder}"
        conn.execute(
            "UPDATE crystallized_nodes SET folder_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?",
            (new_path, node_id, user_id),
        )
        updated = dict(
            conn.execute("SELECT * FROM crystallized_nodes WHERE id = ?", (node_id,)).fetchone()
        )
        export_node_markdown(updated)
    return {"id": node_id, "folder_path": new_path}


@router.post("/{node_id}/verify")
def verify_migrated_node(
    node_id: str,
    current_user: dict = Depends(get_current_user),
) -> dict:
    with get_conn() as conn:
        cur = conn.execute(
            "UPDATE crystallized_nodes SET needs_verification = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?",
            (node_id, current_user["id"]),
        )
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="未找到卡片")
    return {"id": node_id, "needs_verification": 0}
