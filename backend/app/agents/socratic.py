from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

import jsonschema
from pydantic import BaseModel, Field

from app.db.database import get_conn, new_id
from app.db.md_mirror import export_node_markdown
from app.services.llm_client import call_structured_llm

DifficultyLevel = Literal["easy", "medium", "hard"]

DIFFICULTY_INSTRUCTIONS: dict[DifficultyLevel, str] = {
    "easy": "【基础巩固 (Easy)】：构造单一、明确的生活/投资/学习场景，考察核心概念或纪律的直接应用。",
    "medium": "【实战两难 (Medium)】：构造包含干扰项、情绪诱惑或边界条件的现实决策冲突，考察判断力。",
    "hard": "【极限推演 (Hard)】：构造极端黑天鹅、多重约束叠加或跨领域迁移的复杂两难场景，考察深度推演与反脆弱边界。",
}


class SocraticChallengeOutput(BaseModel):
    scenario_question: str = Field(
        ...,
        min_length=15,
        description="构造一个具体的现实决策/应用两难场景题（严禁出概念默写题）",
    )
    hint: str = Field(..., description="一句话思考切入点提示")


class CardEvolutionSpec(BaseModel):
    action: Literal["none", "condense", "enrich"] = Field(
        default="none",
        description="'condense'=用户已熟练掌握，精简冗余示例提升密度；'enrich'=回答暴露盲区，将新边界/补丁融合进卡片；'none'=无需改动",
    )
    updated_atomic_claim: str | None = Field(default=None, max_length=240)
    updated_payload: dict[str, Any] | None = Field(
        default=None,
        description="若需要更新卡片内容，必须完整输出符合该领域 JSON Schema 的新 payload",
    )
    evolution_note: str = Field(default="", description="一句话说明卡片是如何被精简或融合补充的")


class SocraticEvalOutput(BaseModel):
    rating: int = Field(..., ge=1, le=4, description="1=未掌握(重来), 2=有偏差(困难), 3=掌握良好, 4=融会贯通")
    feedback: str = Field(
        ...,
        min_length=10,
        description="结合历史回答对比最新回答，给出更加综合的评估、对比进步点与具体改进建议",
    )
    blind_spot_note: str = Field(default="", description="若暴露认知盲区则简述，无则留空")
    card_evolution: CardEvolutionSpec = Field(default_factory=CardEvolutionSpec)


def get_due_socratic_nodes(domain_slug: str | None = None) -> dict[str, Any]:
    with get_conn() as conn:
        profile_row = conn.execute(
            "SELECT profile_json FROM user_profile WHERE id = 'default'"
        ).fetchone()
        profile = json.loads(profile_row["profile_json"]) if profile_row else {}
        if profile.get("current_bandwidth") == "low":
            return {"suppressed_by_low_bandwidth": True, "due_nodes": []}

        now_iso = datetime.now(timezone.utc).isoformat(timespec="seconds")
        where = "status = 'active' AND (next_review_at IS NULL OR next_review_at <= ?)"
        params: list[Any] = [now_iso]
        if domain_slug:
            where += " AND domain_slug = ?"
            params.append(domain_slug)

        rows = conn.execute(
            f"""
            SELECT * FROM crystallized_nodes
            WHERE {where}
            ORDER BY CASE WHEN node_type = 'knowledge' THEN 0 ELSE 1 END,
                     conversion_weight DESC,
                     created_at ASC
            LIMIT 20
            """,
            tuple(params),
        ).fetchall()

    return {"suppressed_by_low_bandwidth": False, "due_nodes": [dict(r) for r in rows]}


def get_socratic_history(node_id: str | None = None, limit: int = 20) -> list[dict[str, Any]]:
    with get_conn() as conn:
        if node_id:
            rows = conn.execute(
                """
                SELECT l.*, n.title AS node_title, n.short_keyword
                FROM socratic_logs l
                JOIN crystallized_nodes n ON l.node_id = n.id
                WHERE l.node_id = ?
                ORDER BY l.created_at DESC
                LIMIT ?
                """,
                (node_id, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT l.*, n.title AS node_title, n.short_keyword
                FROM socratic_logs l
                JOIN crystallized_nodes n ON l.node_id = n.id
                ORDER BY l.created_at DESC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()
    return [dict(r) for r in rows]


async def generate_socratic_challenge(
    node_id: str,
    difficulty: DifficultyLevel = "medium",
) -> dict[str, Any]:
    with get_conn() as conn:
        node_row = conn.execute(
            "SELECT * FROM crystallized_nodes WHERE id = ?", (node_id,)
        ).fetchone()
        if not node_row:
            raise ValueError(f"未找到结晶节点: {node_id}")

        profile_row = conn.execute(
            "SELECT profile_json FROM user_profile WHERE id = 'default'"
        ).fetchone()
        profile = json.loads(profile_row["profile_json"]) if profile_row else {}

        past_logs = [
            dict(r)
            for r in conn.execute(
                """
                SELECT difficulty, question, user_answer, rating, feedback
                FROM socratic_logs
                WHERE node_id = ?
                ORDER BY created_at DESC LIMIT 2
                """,
                (node_id,),
            ).fetchall()
        ]

    blind_spots = profile.get("cognitive_blind_spots", [])
    system_prompt = (
        "你是【苏格拉底式陪练 (Socratic Coach)】。你的任务是反转信息流向，倒逼用户主动提取并应用知识。\n"
        f"当前指定难度：{DIFFICULTY_INSTRUCTIONS[difficulty]}\n"
        "严格要求：\n"
        "1. 绝对禁止出“请解释什么是XXX”之类的死记硬背/概念默写题。\n"
        "2. 若存在历史陪练记录，请避免出完全相同的题目，并可针对用户上次薄弱点设计新情境。\n"
        f"3. 结合用户历史盲区设计干扰项：{json.dumps(blind_spots, ensure_ascii=False)}\n"
        f"历史陪练参考：{json.dumps(past_logs, ensure_ascii=False)}"
    )
    user_prompt = (
        f"请基于以下结晶认知出 1 道 {difficulty.upper()} 难度的场景应用题：\n"
        f"关键词：{node_row['short_keyword']}\n"
        f"核心命题：{node_row['atomic_claim']}\n"
        f"详细载荷：{node_row['payload_json']}"
    )

    challenge = await call_structured_llm(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        response_model=SocraticChallengeOutput,
        tier="reasoning",
    )
    return {
        "node_id": node_id,
        "node_title": node_row["title"],
        "difficulty": difficulty,
        **challenge.model_dump(),
    }


async def evaluate_socratic_answer(
    node_id: str,
    question: str,
    user_answer: str,
    difficulty: DifficultyLevel = "medium",
) -> dict[str, Any]:
    with get_conn() as conn:
        node_row = conn.execute(
            "SELECT * FROM crystallized_nodes WHERE id = ?", (node_id,)
        ).fetchone()
        if not node_row:
            raise ValueError(f"未找到结晶节点: {node_id}")

        past_logs = [
            dict(r)
            for r in conn.execute(
                """
                SELECT difficulty, question, user_answer, rating, feedback, created_at
                FROM socratic_logs
                WHERE node_id = ?
                ORDER BY created_at DESC LIMIT 3
                """,
                (node_id,),
            ).fetchall()
        ]

        schema_row = conn.execute(
            """
            SELECT json_schema FROM domain_schemas
            WHERE domain_slug = ? AND version = ?
            """,
            (node_row["domain_slug"], node_row["schema_version"]),
        ).fetchone()
        target_schema = json.loads(schema_row["json_schema"]) if schema_row else None

    system_prompt = (
        "你是【苏格拉底式陪练 (Socratic Coach)】。\n"
        "你的任务是：\n"
        "1. 结合用户【历史回答记录】对比【本次最新回答】，给出更综合的评估：指出相比过去的进步或重复出现的盲区，并给出可落地的建议。\n"
        "2. 动态调整结晶卡片的内容密集度（card_evolution）：\n"
        "   - 若本次表现优秀 (rating >= 3) 且已内化基础解释 → action 设为 'condense'，精简掉已掌握的冗长类比/铺垫，保留高密度核心法则；\n"
        "   - 若本次回答有偏差或遗漏边界 (rating <= 2) → action 设为 'enrich'，将本次暴露的缺失边界或反例融合补充进卡片 payload，避免下次再错；\n"
        "   - 若卡片已足够精炼且无新变化 → action 设为 'none'。\n"
        f"3. 若 action 不为 'none'，updated_payload 必须严格符合以下 JSON Schema：\n{json.dumps(target_schema, ensure_ascii=False)}"
    )
    user_prompt = (
        f"当前卡片标题：{node_row['title']}\n"
        f"核心命题：{node_row['atomic_claim']}\n"
        f"当前载荷：{node_row['payload_json']}\n"
        f"历史陪练记录：{json.dumps(past_logs, ensure_ascii=False)}\n"
        f"本次难度：{difficulty}\n"
        f"本次场景问题：{question}\n"
        f"用户最新回答：{user_answer}"
    )

    eval_res = await call_structured_llm(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        response_model=SocraticEvalOutput,
        tier="reasoning",
    )

    # Validate & apply card density evolution if requested
    evolution_note = ""
    if eval_res.card_evolution.action != "none":
        new_claim = eval_res.card_evolution.updated_atomic_claim or node_row["atomic_claim"]
        new_payload = eval_res.card_evolution.updated_payload
        if new_payload and target_schema:
            try:
                jsonschema.validate(instance=new_payload, schema=target_schema)
            except jsonschema.ValidationError:
                new_payload = None
        if new_payload or new_claim != node_row["atomic_claim"]:
            evolution_note = eval_res.card_evolution.evolution_note or f"已执行卡片{eval_res.card_evolution.action}优化"
            with get_conn() as conn:
                conn.execute(
                    """
                    UPDATE crystallized_nodes
                    SET atomic_claim = ?, payload_json = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                    """,
                    (
                        new_claim,
                        json.dumps(new_payload, ensure_ascii=False)
                        if new_payload
                        else node_row["payload_json"],
                        node_id,
                    ),
                )
                updated_node = dict(
                    conn.execute("SELECT * FROM crystallized_nodes WHERE id = ?", (node_id,)).fetchone()
                )
                export_node_markdown(updated_node)

    # Lightweight FSRS-inspired interval update
    prev_state = json.loads(node_row["fsrs_state_json"]) if node_row["fsrs_state_json"] else {}
    prev_stability = float(prev_state.get("stability", 1.0))
    reps = int(prev_state.get("reps", 0)) + 1

    interval_map = {1: 1, 2: 2, 3: 5, 4: 10}
    base_days = interval_map[eval_res.rating]
    new_stability = round(max(1.0, prev_stability * (0.6 if eval_res.rating == 1 else 1.5)), 2)
    next_days = min(60, int(round(base_days * (new_stability / 1.5 if reps > 1 else 1.0))))
    next_review_at = (datetime.now(timezone.utc) + timedelta(days=next_days)).isoformat(
        timespec="seconds"
    )
    new_fsrs_state = {"stability": new_stability, "reps": reps, "last_rating": eval_res.rating}

    log_id = new_id("soc")
    with get_conn() as conn:
        conn.execute(
            """
            INSERT INTO socratic_logs
            (id, node_id, difficulty, question, user_answer, rating, feedback, blind_spot_note, card_evolution_note)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                log_id,
                node_id,
                difficulty,
                question,
                user_answer,
                eval_res.rating,
                eval_res.feedback,
                eval_res.blind_spot_note,
                evolution_note,
            ),
        )
        conn.execute(
            """
            UPDATE crystallized_nodes
            SET fsrs_state_json = ?, next_review_at = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (json.dumps(new_fsrs_state), next_review_at, node_id),
        )
        conn.execute(
            """
            INSERT INTO profile_signals (id, signal_type, domain_slug, payload_json)
            VALUES (?, 'socratic_drill', ?, ?)
            """,
            (
                new_id("sig"),
                node_row["domain_slug"],
                json.dumps(
                    {
                        "node_id": node_id,
                        "difficulty": difficulty,
                        "rating": eval_res.rating,
                        "blind_spot_note": eval_res.blind_spot_note,
                    },
                    ensure_ascii=False,
                ),
            ),
        )

    return {
        "log_id": log_id,
        "node_id": node_id,
        "rating": eval_res.rating,
        "feedback": eval_res.feedback,
        "blind_spot_note": eval_res.blind_spot_note,
        "card_evolution_note": evolution_note,
        "next_review_days": next_days,
        "next_review_at": next_review_at,
    }
