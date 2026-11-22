from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.agents.socratic import (
    evaluate_socratic_answer,
    generate_socratic_challenge,
    get_due_socratic_nodes,
    get_socratic_history,
)
from app.services.llm_client import LLMConfigError

router = APIRouter(prefix="/api/socratic", tags=["socratic"])


class ChallengeRequest(BaseModel):
    node_id: str
    difficulty: Literal["easy", "medium", "hard"] = "medium"


class EvaluateRequest(BaseModel):
    node_id: str
    question: str
    user_answer: str = Field(..., min_length=2)
    difficulty: Literal["easy", "medium", "hard"] = "medium"


@router.get("/due")
def due_nodes_endpoint(domain_slug: str | None = None) -> dict:
    return get_due_socratic_nodes(domain_slug)


@router.get("/history")
def history_endpoint(node_id: str | None = None, limit: int = 20) -> list[dict]:
    return get_socratic_history(node_id=node_id, limit=limit)


@router.post("/challenge")
async def challenge_endpoint(req: ChallengeRequest) -> dict:
    try:
        return await generate_socratic_challenge(req.node_id, req.difficulty)
    except LLMConfigError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"生成苏格拉底场景题失败: {exc}") from exc


@router.post("/evaluate")
async def evaluate_endpoint(req: EvaluateRequest) -> dict:
    try:
        return await evaluate_socratic_answer(
            req.node_id, req.question, req.user_answer, req.difficulty
        )
    except LLMConfigError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"评估回答失败: {exc}") from exc
