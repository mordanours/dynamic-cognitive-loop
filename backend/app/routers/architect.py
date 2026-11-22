from __future__ import annotations

import json
from typing import Literal

from fastapi import APIRouter, HTTPException
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
from app.services.llm_client import LLMConfigError

router = APIRouter(prefix="/api/architect", tags=["architect"])


class ScanRequest(BaseModel):
    domain_slug: Literal["investing", "learning"]


class RefineRequest(BaseModel):
    user_suggestion: str


@router.post("/scan")
async def scan_domain_endpoint(req: ScanRequest) -> dict:
    try:
        return await scan_domain_for_proposals(req.domain_slug)
    except LLMConfigError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"架构师扫描失败: {exc}") from exc


@router.get("/proposals")
def list_proposals(domain_slug: str | None = None, status: str = "pending") -> list[dict]:
    with get_conn() as conn:
        where = ["status = ?"]
        params: list[str] = [status]
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
                    FROM crystallized_nodes WHERE id IN ({placeholders})
                    """,
                    tuple(target_ids),
                ).fetchall()
                d["target_nodes"] = [
                    {**dict(tr), "payload": json.loads(tr["payload_json"])} for tr in trows
                ]
            else:
                d["target_nodes"] = []
            result.append(d)
    return result


@router.post("/proposals/{proposal_id}/approve")
def approve_proposal_endpoint(proposal_id: str) -> dict:
    try:
        return approve_proposal(proposal_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/proposals/{proposal_id}/reject")
def reject_proposal_endpoint(proposal_id: str) -> dict:
    try:
        return reject_proposal(proposal_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/proposals/{proposal_id}/refine")
async def refine_proposal_endpoint(proposal_id: str, req: RefineRequest) -> dict:
    try:
        return await refine_proposal(proposal_id, req.user_suggestion)
    except LLMConfigError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"修订合成失败: {exc}") from exc


@router.get("/schema-status/{domain_slug}")
def schema_status_endpoint(domain_slug: Literal["investing", "learning"]) -> dict:
    return get_schema_evolution_status(domain_slug)


class EvolvePreviewRequest(BaseModel):
    domain_slug: Literal["investing", "learning"]
    custom_fields: list[CustomSchemaField] | None = None
    evolution_goal: str = ""


@router.post("/evolve-schema/preview")
async def evolve_schema_preview_endpoint(req: EvolvePreviewRequest) -> dict:
    try:
        return await preview_schema_evolution(
            req.domain_slug,
            custom_fields=req.custom_fields,
            evolution_goal=req.evolution_goal,
        )
    except LLMConfigError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"生成 Schema 演进预览失败: {exc}") from exc
