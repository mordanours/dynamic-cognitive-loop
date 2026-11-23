from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.agents.architect import (
    CustomSchemaField,
    approve_proposal,
    get_schema_evolution_status,
    preview_schema_evolution,
    refine_proposal,
    reject_proposal,
    scan_domain_for_proposals,
)
from app.db.database import get_conn
from app.services.auth import get_current_user
from app.services.llm_client import LLMConfigError

router = APIRouter(prefix="/api/architect", tags=["architect"])


class ScanRequest(BaseModel):
    domain_slug: str


class RefineRequest(BaseModel):
    user_suggestion: str


class EvolvePreviewRequest(BaseModel):
    domain_slug: str
    custom_fields: list[CustomSchemaField] | None = None
    evolution_goal: str = ""


@router.post("/scan")
async def scan_domain_endpoint(
    req: ScanRequest,
    current_user: dict = Depends(get_current_user),
) -> dict:
    try:
        return await scan_domain_for_proposals(req.domain_slug, user_id=current_user["id"])
    except LLMConfigError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"架构师扫描失败: {exc}") from exc


@router.get("/proposals")
def list_proposals(
    domain_slug: str | None = None,
    status: str = "pending",
    current_user: dict = Depends(get_current_user),
) -> list[dict]:
    user_id = current_user["id"]
    with get_conn() as conn:
        where = ["user_id = ?", "status = ?"]
        params: list[str] = [user_id, status]
        if domain_slug:
            where.append("domain_slug = ?")
            params.append(domain_slug)
        rows = conn.execute(
            f"SELECT * FROM architect_proposals WHERE {' AND '.join(where)} ORDER BY created_at DESC",
            tuple(params),
        ).fetchall()

        result = []
        for r in rows:
            d = dict(r)
            target_ids = json.loads(d["target_node_ids_json"])
            d["target_node_ids"] = target_ids
            d["proposed_node"] = (
                json.loads(d["proposed_node_json"]) if d["proposed_node_json"] else None
            )
            if target_ids:
                placeholders = ",".join("?" for _ in target_ids)
                trows = conn.execute(
                    f"""
                    SELECT id, node_type, folder_path, short_keyword, title, atomic_claim,
                           payload_json, confidence, conversion_weight
                    FROM crystallized_nodes WHERE id IN ({placeholders}) AND user_id = ?
                    """,
                    (*target_ids, user_id),
                ).fetchall()
                d["target_nodes"] = [
                    {**dict(tr), "payload": json.loads(tr["payload_json"])} for tr in trows
                ]
            else:
                d["target_nodes"] = []
            result.append(d)
    return result


@router.post("/proposals/{proposal_id}/approve")
def approve_proposal_endpoint(
    proposal_id: str,
    current_user: dict = Depends(get_current_user),
) -> dict:
    try:
        return approve_proposal(proposal_id, user_id=current_user["id"])
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/proposals/{proposal_id}/reject")
def reject_proposal_endpoint(
    proposal_id: str,
    current_user: dict = Depends(get_current_user),
) -> dict:
    try:
        return reject_proposal(proposal_id, user_id=current_user["id"])
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/proposals/{proposal_id}/refine")
async def refine_proposal_endpoint(
    proposal_id: str,
    req: RefineRequest,
    current_user: dict = Depends(get_current_user),
) -> dict:
    try:
        return await refine_proposal(
            proposal_id, req.user_suggestion, user_id=current_user["id"]
        )
    except LLMConfigError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"修订合成失败: {exc}") from exc


@router.get("/schema-status/{domain_slug}")
def schema_status_endpoint(
    domain_slug: str,
    current_user: dict = Depends(get_current_user),
) -> dict:
    return get_schema_evolution_status(domain_slug, user_id=current_user["id"])


@router.post("/evolve-schema/preview")
async def evolve_schema_preview_endpoint(
    req: EvolvePreviewRequest,
    current_user: dict = Depends(get_current_user),
) -> dict:
    try:
        return await preview_schema_evolution(
            req.domain_slug,
            custom_fields=req.custom_fields,
            evolution_goal=req.evolution_goal,
            user_id=current_user["id"],
        )
    except LLMConfigError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"生成 Schema 演进预览失败: {exc}") from exc
