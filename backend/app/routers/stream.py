from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.db.database import estimate_tokens, get_conn, new_id
from app.services.auth import get_current_user
from app.services.scheduler import run_stream_ttl_decay

router = APIRouter(prefix="/api/stream", tags=["stream"])


class CreateStreamRequest(BaseModel):
    raw_content: str = Field(..., min_length=5, description="原始对话记录或临时灵感")
    domain_hint: str = "investing"
    source: str = "chat_paste"
    ttl_days: int = Field(default=7, ge=1, le=30)


@router.post("")
def create_stream_item(
    req: CreateStreamRequest,
    current_user: dict = Depends(get_current_user),
) -> dict:
    user_id = current_user["id"]
    item_id = new_id("str")
    tokens = estimate_tokens(req.raw_content)
    expires_at = (
        datetime.now(timezone.utc) + timedelta(days=req.ttl_days)
    ).isoformat(timespec="seconds")

    with get_conn() as conn:
        conn.execute(
            """
            INSERT INTO stream_items
            (id, user_id, source, domain_hint, raw_content, token_count, salience_score, status, ttl_days, expires_at)
            VALUES (?, ?, ?, ?, ?, ?, 1.0, 'inbox', ?, ?)
            """,
            (item_id, user_id, req.source, req.domain_hint, req.raw_content, tokens, req.ttl_days, expires_at),
        )
        row = conn.execute("SELECT * FROM stream_items WHERE id = ?", (item_id,)).fetchone()
    return dict(row)


@router.get("")
def list_stream_items(
    status: str | None = None,
    current_user: dict = Depends(get_current_user),
) -> list[dict]:
    user_id = current_user["id"]
    with get_conn() as conn:
        if status:
            rows = conn.execute(
                "SELECT * FROM stream_items WHERE user_id = ? AND status = ? ORDER BY created_at DESC",
                (user_id, status),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM stream_items WHERE user_id = ? ORDER BY created_at DESC",
                (user_id,),
            ).fetchall()
    return [dict(r) for r in rows]


@router.delete("/{stream_id}")
def delete_stream_item(
    stream_id: str,
    current_user: dict = Depends(get_current_user),
) -> dict:
    with get_conn() as conn:
        cur = conn.execute(
            "DELETE FROM stream_items WHERE id = ? AND user_id = ?",
            (stream_id, current_user["id"]),
        )
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Stream item not found")
    return {"deleted": stream_id}


@router.post("/decay")
def trigger_ttl_decay(current_user: dict = Depends(get_current_user)) -> dict[str, int]:
    _ = current_user
    return run_stream_ttl_decay()
