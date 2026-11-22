from __future__ import annotations

import json
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.db.database import get_conn
from app.services.auth import get_current_user

router = APIRouter(prefix="/api", tags=["profile & metrics"])


class BandwidthUpdate(BaseModel):
    bandwidth: Literal["low", "medium", "high"]


@router.get("/profile")
def get_profile(current_user: dict = Depends(get_current_user)) -> dict:
    user_id = current_user["id"]
    with get_conn() as conn:
        row = conn.execute(
            "SELECT profile_json, updated_at FROM user_profile WHERE id = ?",
            (user_id,),
        ).fetchone()
    profile = json.loads(row["profile_json"])
    profile["updated_at"] = row["updated_at"]
    return profile


@router.patch("/profile/bandwidth")
def update_bandwidth(
    req: BandwidthUpdate,
    current_user: dict = Depends(get_current_user),
) -> dict:
    user_id = current_user["id"]
    with get_conn() as conn:
        row = conn.execute(
            "SELECT profile_json FROM user_profile WHERE id = ?",
            (user_id,),
        ).fetchone()
        profile = json.loads(row["profile_json"])
        profile["current_bandwidth"] = req.bandwidth
        conn.execute(
            "UPDATE user_profile SET profile_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (json.dumps(profile, ensure_ascii=False), user_id),
        )
    return {"current_bandwidth": req.bandwidth}


@router.get("/metrics")
def get_metrics(current_user: dict = Depends(get_current_user)) -> dict:
    user_id = current_user["id"]
    with get_conn() as conn:
        stream_total = conn.execute(
            "SELECT COUNT(*) FROM stream_items WHERE user_id = ?", (user_id,)
        ).fetchone()[0]
        stream_inbox = conn.execute(
            "SELECT COUNT(*) FROM stream_items WHERE user_id = ? AND status = 'inbox'",
            (user_id,),
        ).fetchone()[0]
        nodes_total = conn.execute(
            "SELECT COUNT(*) FROM crystallized_nodes WHERE user_id = ? AND status NOT IN ('merged', 'deprecated')",
            (user_id,),
        ).fetchone()[0]
        avg_ratio = conn.execute(
            "SELECT AVG(compression_ratio) FROM crystallized_nodes WHERE user_id = ? AND compression_ratio IS NOT NULL",
            (user_id,),
        ).fetchone()[0]
        actions_total = conn.execute(
            "SELECT COUNT(*) FROM action_experiments WHERE user_id = ?", (user_id,)
        ).fetchone()[0]
        actions_verified = conn.execute(
            "SELECT COUNT(*) FROM action_experiments WHERE user_id = ? AND status IN ('succeeded', 'failed')",
            (user_id,),
        ).fetchone()[0]
        actions_succeeded = conn.execute(
            "SELECT COUNT(*) FROM action_experiments WHERE user_id = ? AND status = 'succeeded'",
            (user_id,),
        ).fetchone()[0]
        avg_weight = conn.execute(
            "SELECT AVG(conversion_weight) FROM crystallized_nodes WHERE user_id = ? AND status NOT IN ('merged', 'deprecated')",
            (user_id,),
        ).fetchone()[0]

    dcr = round((actions_verified / nodes_total) * 100, 1) if nodes_total > 0 else 0.0
    return {
        "dcr_percent": dcr,
        "avg_compression_ratio": round(float(avg_ratio), 1) if avg_ratio else 0.0,
        "avg_conversion_weight": round(float(avg_weight), 2) if avg_weight else 0.5,
        "stream_total": stream_total,
        "stream_inbox": stream_inbox,
        "nodes_total": nodes_total,
        "actions_total": actions_total,
        "actions_verified": actions_verified,
        "actions_succeeded": actions_succeeded,
    }
