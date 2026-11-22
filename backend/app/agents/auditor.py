from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.db.database import get_conn, new_id
from app.db.md_mirror import export_node_markdown
from app.services.llm_client import call_structured_llm


class ActionProposalOutput(BaseModel):
    theoretical_basis: str = Field(
        ...,
        min_length=10,
        max_length=200,
        description="底层理论依据：结合领域核心原理/心智模型解释为什么该微行动有效（严禁直接复述原对话）",
    )
    hypothesis: str = Field(..., description="这次微行动旨在验证什么核心假设")
    trigger_condition: str = Field(..., description="If: 明确的生活/投资/学习触发情境")
    micro_action: str = Field(
        ...,
        max_length=120,
        description="Then: 极度简洁明了、15分钟内可启动的具体微行动",
    )
    success_metric: str = Field(..., description="可观测的完成标准")
    bandwidth_cost: Literal["low", "medium", "high"] = "low"
    check_in_hours: int = Field(default=24, ge=1, le=168, description="建议多少小时后发起审计追问")


async def propose_micro_action(node_id: str, user_id: str = "usr_default") -> dict[str, Any]:
    with get_conn() as conn:
        node_row = conn.execute(
            "SELECT * FROM crystallized_nodes WHERE id = ? AND user_id = ?",
            (node_id, user_id),
        ).fetchone()
        if not node_row:
            raise ValueError(f"未找到结晶节点: {node_id}")

        profile_row = conn.execute(
            "SELECT profile_json FROM user_profile WHERE id = ?",
            (user_id,),
        ).fetchone()
        profile = json.loads(profile_row["profile_json"]) if profile_row else {}

        # Pull top knowledge nodes in the same domain for theoretical grounding
        knowledge_rows = conn.execute(
            """
            SELECT short_keyword, title, atomic_claim
            FROM crystallized_nodes
            WHERE user_id = ? AND domain_slug = ? AND status = 'active' AND id != ?
            ORDER BY CASE WHEN node_type = 'knowledge' THEN 0 ELSE 1 END, conversion_weight DESC
            LIMIT 4
            """,
            (user_id, node_row["domain_slug"], node_id),
        ).fetchall()

        # Pull user's recent real audit reflections so Auditor adapts continuously!
        recent_audits = conn.execute(
            """
            SELECT outcome_score, friction_tag, user_reflection
            FROM audit_logs
            WHERE user_id = ? AND user_reflection IS NOT NULL AND trim(user_reflection) != ''
            ORDER BY created_at DESC
            LIMIT 5
            """,
            (user_id,),
        ).fetchall()

    bandwidth = profile.get("current_bandwidth", "medium")
    blind_spots = profile.get("cognitive_blind_spots", [])
    knowledge_context = [dict(r) for r in knowledge_rows]
    feedback_memory = [dict(r) for r in recent_audits]

    bandwidth_rule = (
        "当前用户处于【LOW 低精力带宽】：必须极度降维！micro_action 必须可在 5 分钟内完成且一句话说清，"
        "bandwidth_cost 必须为 'low'，禁止复杂前置准备。"
        if bandwidth == "low"
        else f"当前用户处于【{bandwidth.upper()} 带宽】：可设计 10-15 分钟内可启动的具体微实验。"
    )

    system_prompt = (
        "你是【知行审计员 (Execution Auditor)】。你的使命是将认知转化为【有理论支撑、操作极度简洁】的现实微实验。\n"
        f"{bandwidth_rule}\n"
        "【核心质量要求】：\n"
        "1. 严禁直接复述或照搬原对话句子来拼凑 If-Then！必须先在 theoretical_basis 中结合底层原理/理论模型说明“为什么这么做有效”，再推导出一个具体可检验的微动作。\n"
        "2. micro_action 必须像操作清单一样简洁明了、一看就能动手。\n"
        "3. 若当前卡片属于 'knowledge'（知识类），请将其转化为“费曼输出/案例诊断/核对清单”类微实验以检验真正理解。\n"
        f"4. 必须严格吸取用户近期真实反馈教训（正分保留风格，负分坚决规避）：{json.dumps(feedback_memory, ensure_ascii=False)}\n"
        f"5. 同领域可引用的关联认知/理论背景：{json.dumps(knowledge_context, ensure_ascii=False)}\n"
        f"6. 规避用户历史认知盲区：{json.dumps(blind_spots, ensure_ascii=False)}"
    )

    user_prompt = (
        f"请为以下原子认知设计 1 条有理论依据且简洁明了的可执行微实验：\n"
        f"卡片类型：{node_row['node_type']} | 关键词：{node_row['short_keyword']}\n"
        f"标题：{node_row['title']}\n"
        f"核心命题：{node_row['atomic_claim']}\n"
        f"详细载荷：{node_row['payload_json']}"
    )

    proposal = await call_structured_llm(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        response_model=ActionProposalOutput,
        tier="reasoning",
        user_id=user_id,
    )

    if bandwidth == "low":
        proposal.bandwidth_cost = "low"

    action_id = new_id("act")
    check_in_at = (
        datetime.now(timezone.utc) + timedelta(hours=proposal.check_in_hours)
    ).isoformat(timespec="seconds")

    with get_conn() as conn:
        conn.execute(
            """
            INSERT INTO action_experiments
            (id, user_id, node_id, theoretical_basis, hypothesis, trigger_condition, micro_action,
             success_metric, bandwidth_cost, status, check_in_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
            """,
            (
                action_id,
                user_id,
                node_id,
                proposal.theoretical_basis,
                proposal.hypothesis,
                proposal.trigger_condition,
                proposal.micro_action,
                proposal.success_metric,
                proposal.bandwidth_cost,
                check_in_at,
            ),
        )
        action_row = conn.execute(
            "SELECT * FROM action_experiments WHERE id = ?", (action_id,)
        ).fetchone()
        all_actions = [
            dict(r)
            for r in conn.execute(
                "SELECT * FROM action_experiments WHERE node_id = ?", (node_id,)
            ).fetchall()
        ]
        export_node_markdown(dict(node_row), all_actions)

    return dict(action_row)


def submit_action_audit(
    action_id: str,
    executed: bool,
    outcome_score: int,
    friction_tag: str = "none",
    user_reflection: str = "",
    user_id: str = "usr_default",
) -> dict[str, Any]:
    """Deterministic closed-loop calibration writing real-world feedback back to Crystallized & Profile layers."""
    if outcome_score < -2 or outcome_score > 2:
        raise ValueError("outcome_score 必须在 -2 到 +2 之间")

    with get_conn() as conn:
        action_row = conn.execute(
            "SELECT * FROM action_experiments WHERE id = ? AND user_id = ?",
            (action_id, user_id),
        ).fetchone()
        if not action_row:
            raise ValueError(f"未找到行动实验: {action_id}")

        node_row = conn.execute(
            "SELECT * FROM crystallized_nodes WHERE id = ? AND user_id = ?",
            (action_row["node_id"], user_id),
        ).fetchone()
        profile_row = conn.execute(
            "SELECT profile_json FROM user_profile WHERE id = ?",
            (user_id,),
        ).fetchone()
        profile = json.loads(profile_row["profile_json"])

        old_weight = float(node_row["conversion_weight"])
        old_conf = float(node_row["confidence"])
        new_weight = old_weight
        new_conf = old_conf
        new_node_status = node_row["status"]

        if executed:
            if outcome_score > 0:
                new_weight = min(1.0, round(old_weight + 0.15 * outcome_score, 3))
                new_conf = min(1.0, round(old_conf + 0.05 * outcome_score, 3))
                new_action_status = "succeeded"
            elif outcome_score < 0:
                new_weight = max(0.05, round(old_weight - 0.10, 3))
                new_conf = max(0.05, round(old_conf - 0.20, 3))
                new_action_status = "failed"
                if new_conf < 0.35:
                    new_node_status = "contested"
            else:
                new_action_status = "succeeded"

            domain_slug = node_row["domain_slug"]
            mastery = profile.setdefault("domain_mastery", {}).setdefault(
                domain_slug, {"tier": 1, "actions_verified": 0}
            )
            mastery["actions_verified"] = int(mastery.get("actions_verified", 0)) + 1
        else:
            new_weight = max(0.05, round(old_weight - 0.05, 3))
            new_action_status = "abandoned"

        delta = {
            "conversion_weight_delta": round(new_weight - old_weight, 3),
            "confidence_delta": round(new_conf - old_conf, 3),
            "new_node_status": new_node_status,
            "friction_tag": friction_tag,
        }

        audit_id = new_id("audit")
        conn.execute(
            """
            INSERT INTO audit_logs
            (id, user_id, action_id, executed, outcome_score, friction_tag, user_reflection, calibration_delta_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                audit_id,
                user_id,
                action_id,
                1 if executed else 0,
                outcome_score,
                friction_tag,
                user_reflection,
                json.dumps(delta, ensure_ascii=False),
            ),
        )

        conn.execute(
            "UPDATE action_experiments SET status = ? WHERE id = ? AND user_id = ?",
            (new_action_status, action_id, user_id),
        )
        conn.execute(
            """
            UPDATE crystallized_nodes
            SET conversion_weight = ?, confidence = ?, status = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND user_id = ?
            """,
            (new_weight, new_conf, new_node_status, node_row["id"], user_id),
        )
        conn.execute(
            "UPDATE user_profile SET profile_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (json.dumps(profile, ensure_ascii=False), user_id),
        )
        conn.execute(
            """
            INSERT INTO profile_signals (id, user_id, signal_type, domain_slug, payload_json)
            VALUES (?, ?, 'action_audit', ?, ?)
            """,
            (
                new_id("sig"),
                user_id,
                node_row["domain_slug"],
                json.dumps(
                    {
                        "executed": executed,
                        "outcome_score": outcome_score,
                        "friction_tag": friction_tag,
                    },
                    ensure_ascii=False,
                ),
            ),
        )

        updated_node = dict(
            conn.execute(
                "SELECT * FROM crystallized_nodes WHERE id = ?", (node_row["id"],)
            ).fetchone()
        )
        all_actions = [
            dict(r)
            for r in conn.execute(
                "SELECT * FROM action_experiments WHERE node_id = ?", (node_row["id"],)
            ).fetchall()
        ]
        export_node_markdown(updated_node, all_actions)

    return {
        "audit_id": audit_id,
        "action_status": new_action_status,
        "node_id": node_row["id"],
        "calibration_delta": delta,
        "updated_node": updated_node,
    }
