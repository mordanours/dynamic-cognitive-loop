from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.agents.auditor import propose_micro_action, submit_action_audit
from app.db.database import get_conn
from app.services.llm_client import LLMConfigError

router = APIRouter(prefix="/api/actions", tags=["actions"])


class ProposeActionRequest(BaseModel):
    node_id: str


class AuditActionRequest(BaseModel):
    executed: bool
    outcome_score: int = Field(..., ge=-2, le=2)
    friction_tag: Literal[
        "none", "forgot", "too_complex", "context_mismatch", "hypothesis_wrong"
    ] = "none"
    user_reflection: str = ""


@router.post("/propose")
async def propose_action_endpoint(req: ProposeActionRequest) -> dict:
    try:
        return await propose_micro_action(req.node_id)
    except LLMConfigError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"生成微行动失败: {exc}") from exc


@router.post("/{action_id}/audit")
def audit_action_endpoint(action_id: str, req: AuditActionRequest) -> dict:
    try:
        return submit_action_audit(
            action_id=action_id,
            executed=req.executed,
            outcome_score=req.outcome_score,
            friction_tag=req.friction_tag,
            user_reflection=req.user_reflection,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("")
def list_actions(status: str | None = None) -> list[dict]:
    with get_conn() as conn:
        query = """
            SELECT a.*, n.title AS node_title, n.domain_slug, n.atomic_claim, n.conversion_weight
            FROM action_experiments a
            JOIN crystallized_nodes n ON a.node_id = n.id
        """
        if status:
            rows = conn.execute(
                query + " WHERE a.status = ? ORDER BY a.created_at DESC",
                (status,),
            ).fetchall()
        else:
            rows = conn.execute(query + " ORDER BY a.created_at DESC").fetchall()
    return [dict(r) for r in rows]
