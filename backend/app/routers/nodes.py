from __future__ import annotations

import json

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
    domain_slug: str | None = None


class CreateFolderRequest(BaseModel):
    domain_slug: str
    folder_name: str = Field(..., min_length=1, max_length=32)
    parent_id: str | None = None


class RenameFolderRequest(BaseModel):
    domain_slug: str
    folder_id: str | None = None
    old_name: str = Field(..., min_length=1, max_length=32)
    new_name: str = Field(..., min_length=1, max_length=32)


class MoveNodeFolderRequest(BaseModel):
    folder_name: str = Field(..., min_length=1, max_length=80)


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
        try:
            d["rich_blocks"] = json.loads(d.get("rich_blocks_json") or "[]")
        except Exception:
            d["rich_blocks"] = []
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
                "SELECT * FROM domain_folders WHERE user_id = ? AND domain_slug = ? ORDER BY is_system DESC, parent_id IS NOT NULL, created_at ASC",
                (user_id, domain_slug),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM domain_folders WHERE user_id = ? ORDER BY domain_slug, is_system DESC, parent_id IS NOT NULL, created_at ASC",
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
        if req.parent_id:
            parent = conn.execute(
                "SELECT * FROM domain_folders WHERE id = ? AND user_id = ? AND domain_slug = ?",
                (req.parent_id, user_id, req.domain_slug),
            ).fetchone()
            if not parent:
                raise HTTPException(status_code=404, detail="未找到父级目录")
            if parent["parent_id"] is not None:
                raise HTTPException(status_code=400, detail="仅支持固定两级目录，不能在二级目录下继续建目录")

        exists = conn.execute(
            "SELECT id FROM domain_folders WHERE user_id = ? AND domain_slug = ? AND folder_name = ? AND COALESCE(parent_id, '') = ?",
            (user_id, req.domain_slug, clean_name, req.parent_id or ""),
        ).fetchone()
        if exists:
            raise HTTPException(status_code=400, detail=f"同级目录下 '{clean_name}' 已存在")

        fid = new_id("fld")
        conn.execute(
            "INSERT INTO domain_folders (id, user_id, domain_slug, folder_name, parent_id, is_system) VALUES (?, ?, ?, ?, ?, 0)",
            (fid, user_id, req.domain_slug, clean_name, req.parent_id),
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
        if req.folder_id:
            target = conn.execute(
                "SELECT * FROM domain_folders WHERE id = ? AND user_id = ?",
                (req.folder_id, user_id),
            ).fetchone()
        else:
            target = conn.execute(
                "SELECT * FROM domain_folders WHERE user_id = ? AND domain_slug = ? AND folder_name = ?",
                (user_id, req.domain_slug, old_clean),
            ).fetchone()

        if not target or target["is_system"] == 1:
            raise HTTPException(status_code=400, detail="目录不存在或不可重命名")

        conn.execute(
            "UPDATE domain_folders SET folder_name = ? WHERE id = ? AND user_id = ?",
            (new_clean, target["id"], user_id),
        )

        # Update crystallized_nodes.folder_path cleanly for level-1 or level-2 folder
        if target["parent_id"]:
            parent = conn.execute(
                "SELECT folder_name FROM domain_folders WHERE id = ?", (target["parent_id"],)
            ).fetchone()
            prefix = f"{req.domain_slug}/{parent['folder_name']}/" if parent else f"{req.domain_slug}/"
            conn.execute(
                "UPDATE crystallized_nodes SET folder_path = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND folder_path = ?",
                (prefix + new_clean, user_id, prefix + old_clean),
            )
        else:
            old_prefix = f"{req.domain_slug}/{old_clean}"
            new_prefix = f"{req.domain_slug}/{new_clean}"
            conn.execute(
                "UPDATE crystallized_nodes SET folder_path = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND folder_path = ?",
                (new_prefix, user_id, old_prefix),
            )
            conn.execute(
                """
                UPDATE crystallized_nodes
                SET folder_path = ? || substr(folder_path, length(?) + 1),
                    updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ? AND folder_path LIKE ?
                """,
                (new_prefix + "/", old_prefix + "/", user_id, old_prefix + "/%"),
            )
    return {"domain_slug": req.domain_slug, "old_name": old_clean, "new_name": new_clean}


@router.patch("/{node_id}/folder")
def move_node_folder(
    node_id: str,
    req: MoveNodeFolderRequest,
    current_user: dict = Depends(get_current_user),
) -> dict:
    user_id = current_user["id"]
    rel_parts = [p.strip() for p in req.folder_name.strip("/").split("/") if p.strip()][:2]
    if not rel_parts:
        rel_parts = ["核心认知"]
    with get_conn() as conn:
        node = conn.execute(
            "SELECT * FROM crystallized_nodes WHERE id = ? AND user_id = ?",
            (node_id, user_id),
        ).fetchone()
        if not node:
            raise HTTPException(status_code=404, detail="未找到卡片")
        new_path = f"{node['domain_slug']}/{'/'.join(rel_parts)}"
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
