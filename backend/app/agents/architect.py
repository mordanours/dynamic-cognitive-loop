from __future__ import annotations

import json
from typing import Any, Literal

import jsonschema
from pydantic import BaseModel, Field

from app.db.database import get_conn, new_id
from app.db.md_mirror import export_node_markdown
from app.services.llm_client import call_structured_llm


class MergedNodeSpec(BaseModel):
    node_type: Literal["knowledge", "decision"]
    folder_path: str = Field(..., min_length=3, max_length=60)
    short_keyword: str = Field(..., min_length=2, max_length=16)
    title: str = Field(..., min_length=2, max_length=80)
    atomic_claim: str = Field(..., min_length=5, max_length=240)
    payload: dict[str, Any]


class ArchitectProposalDraft(BaseModel):
    proposal_type: Literal["merge_duplicates", "deprecate_low_utility"]
    target_node_ids: list[str] = Field(..., min_length=1)
    rationale: str = Field(..., min_length=5, max_length=300)
    merged_node: MergedNodeSpec | None = Field(
        default=None,
        description="当 proposal_type 为 merge_duplicates 时必填，给出合并后的高密度母卡片",
    )


class ArchitectScanOutput(BaseModel):
    summary: str
    proposals: list[ArchitectProposalDraft] = Field(default_factory=list, max_length=5)


async def scan_domain_for_proposals(
    domain_slug: str,
    user_id: str = "usr_default",
) -> dict[str, Any]:
    with get_conn() as conn:
        nodes = [
            dict(r)
            for r in conn.execute(
                """
                SELECT id, node_type, folder_path, short_keyword, title, atomic_claim,
                       payload_json, confidence, conversion_weight, status
                FROM crystallized_nodes
                WHERE user_id = ? AND domain_slug = ? AND status NOT IN ('merged', 'deprecated')
                ORDER BY conversion_weight DESC, created_at DESC
                """,
                (user_id, domain_slug),
            ).fetchall()
        ]
        if len(nodes) < 2:
            return {"summary": "活跃卡片不足 2 条，暂无需合并整理。", "created_proposals": []}

        schema_row = conn.execute(
            """
            SELECT * FROM domain_schemas
            WHERE user_id = ? AND domain_slug = ? AND is_active = 1
            ORDER BY version DESC LIMIT 1
            """,
            (user_id, domain_slug),
        ).fetchone()
        target_schema = json.loads(schema_row["json_schema"])

    system_prompt = (
        "你是【数据结构架构师 (Schema Architect)】。你的使命是清理结晶层的信息冗余、合并同义重复卡片、淘汰低效用噪音。\n"
        f"目标领域：{domain_slug} (Schema v{schema_row['version']})。\n"
        "严格要求：\n"
        "1. 仔细比对所有活跃卡片的 title 和 atomic_claim。如果发现 2 条及以上高度同义或探讨同一子问题的卡片，提出 'merge_duplicates' 提案，并在 merged_node 中融合它们最精华、权重最高的部分。\n"
        "2. 合并后的 merged_node 必须保留正确的 node_type（'knowledge' 用名词短语，'decision' 用动词短语）和 folder_path。\n"
        "3. 如果发现 confidence < 0.35 且 conversion_weight < 0.35 的低效用卡片，可提出 'deprecate_low_utility'。\n"
        "4. 若没有明显重复或低效用卡片，proposals 返回空列表即可，严禁强行合并。\n"
        f"5. merged_node.payload 必须严格符合以下 JSON Schema：\n{json.dumps(target_schema, ensure_ascii=False)}"
    )

    user_prompt = f"请扫描以下活跃结晶卡片并提出整理提案：\n{json.dumps(nodes, ensure_ascii=False)}"

    result = await call_structured_llm(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        response_model=ArchitectScanOutput,
        tier="reasoning",
        user_id=user_id,
    )

    valid_ids = {n["id"] for n in nodes}
    created: list[dict[str, Any]] = []

    with get_conn() as conn:
        for prop in result.proposals:
            filtered_ids = [nid for nid in prop.target_node_ids if nid in valid_ids]
            if prop.proposal_type == "merge_duplicates":
                if len(filtered_ids) < 2 or prop.merged_node is None:
                    continue
                jsonschema.validate(instance=prop.merged_node.payload, schema=target_schema)
            elif not filtered_ids:
                continue

            prop_id = new_id("prop")
            conn.execute(
                """
                INSERT INTO architect_proposals
                (id, user_id, domain_slug, proposal_type, target_node_ids_json, proposed_node_json, rationale, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
                """,
                (
                    prop_id,
                    user_id,
                    domain_slug,
                    prop.proposal_type,
                    json.dumps(filtered_ids),
                    prop.merged_node.model_dump_json() if prop.merged_node else None,
                    prop.rationale,
                ),
            )
            row = conn.execute(
                "SELECT * FROM architect_proposals WHERE id = ?", (prop_id,)
            ).fetchone()
            created.append(dict(row))

    return {"summary": result.summary, "created_proposals": created}


def approve_proposal(proposal_id: str, user_id: str = "usr_default") -> dict[str, Any]:
    with get_conn() as conn:
        prop = conn.execute(
            "SELECT * FROM architect_proposals WHERE id = ? AND user_id = ?",
            (proposal_id, user_id),
        ).fetchone()
        if not prop:
            raise ValueError(f"未找到提案: {proposal_id}")
        if prop["status"] != "pending":
            raise ValueError("该提案已处理")

        target_ids: list[str] = json.loads(prop["target_node_ids_json"])
        placeholders = ",".join("?" for _ in target_ids)

        if prop["proposal_type"] == "merge_duplicates":
            merged = json.loads(prop["proposed_node_json"])
            target_rows = conn.execute(
                f"SELECT * FROM crystallized_nodes WHERE id IN ({placeholders})",
                tuple(target_ids),
            ).fetchall()

            max_weight = max([float(r["conversion_weight"]) for r in target_rows] or [0.5])
            max_conf = max([float(r["confidence"]) for r in target_rows] or [0.6])
            schema_ver = max([int(r["schema_version"]) for r in target_rows] or [1])

            new_node_id = new_id("node")
            conn.execute(
                """
                INSERT INTO crystallized_nodes
                (id, user_id, domain_slug, schema_version, node_type, folder_path, short_keyword,
                 title, atomic_claim, payload_json, confidence, conversion_weight,
                 status, source_stream_ids, discarded_noise)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
                """,
                (
                    new_node_id,
                    user_id,
                    prop["domain_slug"],
                    schema_ver,
                    merged["node_type"],
                    merged["folder_path"],
                    merged["short_keyword"],
                    merged["title"],
                    merged["atomic_claim"],
                    json.dumps(merged["payload"], ensure_ascii=False),
                    max_conf,
                    max_weight,
                    json.dumps(target_ids),
                    f"由 Schema Architect 合并自 {len(target_ids)} 条重复节点",
                ),
            )

            # Archive old duplicate nodes and migrate active actions
            conn.execute(
                f"UPDATE crystallized_nodes SET status = 'merged', updated_at = CURRENT_TIMESTAMP WHERE id IN ({placeholders})",
                tuple(target_ids),
            )
            conn.execute(
                f"UPDATE action_experiments SET node_id = ? WHERE node_id IN ({placeholders}) AND status IN ('active', 'proposed')",
                (new_node_id, *target_ids),
            )

            new_node = dict(
                conn.execute("SELECT * FROM crystallized_nodes WHERE id = ?", (new_node_id,)).fetchone()
            )
            export_node_markdown(new_node)

        elif prop["proposal_type"] == "deprecate_low_utility":
            conn.execute(
                f"UPDATE crystallized_nodes SET status = 'deprecated', updated_at = CURRENT_TIMESTAMP WHERE id IN ({placeholders})",
                tuple(target_ids),
            )

        elif prop["proposal_type"] == "evolve_schema":
            evo_data = json.loads(prop["proposed_node_json"])
            to_version = int(evo_data["to_version"])
            to_schema = evo_data["to_schema"]
            domain_slug = prop["domain_slug"]
            domain_name = "个人投资与决策" if domain_slug == "investing" else "教育学习"

            conn.execute(
                "UPDATE domain_schemas SET is_active = 0 WHERE user_id = ? AND domain_slug = ?",
                (user_id, domain_slug),
            )
            conn.execute(
                """
                INSERT OR REPLACE INTO domain_schemas
                (id, user_id, domain_slug, domain_name, version, mastery_tier, json_schema, rationale, is_active)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
                """,
                (
                    f"schema_{user_id}_{domain_slug}_v{to_version}",
                    user_id,
                    domain_slug,
                    domain_name,
                    to_version,
                    to_version,
                    json.dumps(to_schema, ensure_ascii=False),
                    prop["rationale"],
                ),
            )

            for item in evo_data.get("migrated_nodes", []):
                conn.execute(
                    """
                    UPDATE crystallized_nodes
                    SET schema_version = ?, payload_json = ?, needs_verification = 1, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                    """,
                    (
                        to_version,
                        json.dumps(item["new_payload"], ensure_ascii=False),
                        item["node_id"],
                    ),
                )
                updated_node = dict(
                    conn.execute(
                        "SELECT * FROM crystallized_nodes WHERE id = ?", (item["node_id"],)
                    ).fetchone()
                )
                export_node_markdown(updated_node)

            # Update user_profile domain mastery tier
            prof_row = conn.execute(
                "SELECT profile_json FROM user_profile WHERE id = ?",
                (user_id,),
            ).fetchone()
            if prof_row:
                profile = json.loads(prof_row["profile_json"])
                mastery = profile.setdefault("domain_mastery", {}).setdefault(
                    domain_slug, {"tier": 1, "actions_verified": 0}
                )
                mastery["tier"] = to_version
                conn.execute(
                    "UPDATE user_profile SET profile_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                    (json.dumps(profile, ensure_ascii=False), user_id),
                )

        conn.execute(
            "UPDATE architect_proposals SET status = 'approved' WHERE id = ?",
            (proposal_id,),
        )

    return {"proposal_id": proposal_id, "status": "approved"}


def reject_proposal(proposal_id: str, user_id: str = "usr_default") -> dict[str, Any]:
    with get_conn() as conn:
        cur = conn.execute(
            "UPDATE architect_proposals SET status = 'rejected' WHERE id = ? AND user_id = ? AND status = 'pending'",
            (proposal_id, user_id),
        )
        if cur.rowcount == 0:
            raise ValueError("提案不存在或已处理")
    return {"proposal_id": proposal_id, "status": "rejected"}


class RefinedProposalOutput(BaseModel):
    rationale: str = Field(..., min_length=5, max_length=300)
    merged_node: MergedNodeSpec


async def refine_proposal(
    proposal_id: str,
    user_suggestion: str,
    user_id: str = "usr_default",
) -> dict[str, Any]:
    """Re-synthesize a pending merge proposal incorporating user's intuition/suggestion."""
    with get_conn() as conn:
        prop = conn.execute(
            "SELECT * FROM architect_proposals WHERE id = ? AND user_id = ?",
            (proposal_id, user_id),
        ).fetchone()
        if not prop:
            raise ValueError(f"未找到提案: {proposal_id}")
        if prop["status"] != "pending":
            raise ValueError("只能修订待审批的提案")

        target_ids: list[str] = json.loads(prop["target_node_ids_json"])
        placeholders = ",".join("?" for _ in target_ids)
        target_nodes = [
            dict(r)
            for r in conn.execute(
                f"SELECT id, node_type, folder_path, short_keyword, title, atomic_claim, payload_json, conversion_weight FROM crystallized_nodes WHERE id IN ({placeholders}) AND user_id = ?",
                (*target_ids, user_id),
            ).fetchall()
        ]
        schema_row = conn.execute(
            """
            SELECT * FROM domain_schemas
            WHERE user_id = ? AND domain_slug = ? AND is_active = 1
            ORDER BY version DESC LIMIT 1
            """,
            (user_id, prop["domain_slug"]),
        ).fetchone()
        target_schema = json.loads(schema_row["json_schema"])

    system_prompt = (
        "你是【数据结构架构师 (Schema Architect)】。用户对当前的卡片合并方案提出了修改建议。\n"
        "请严格尊重用户的直觉与建议，重新合成 merged_node 并更新 rationale。\n"
        f"merged_node.payload 必须严格符合以下 JSON Schema：\n{json.dumps(target_schema, ensure_ascii=False)}"
    )
    user_prompt = (
        f"原目标卡片：{json.dumps(target_nodes, ensure_ascii=False)}\n"
        f"上一版合并草案：{prop['proposed_node_json']}\n"
        f"用户的修改建议：{user_suggestion}"
    )

    refined = await call_structured_llm(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        response_model=RefinedProposalOutput,
        tier="reasoning",
        user_id=user_id,
    )
    jsonschema.validate(instance=refined.merged_node.payload, schema=target_schema)

    with get_conn() as conn:
        conn.execute(
            """
            UPDATE architect_proposals
            SET proposed_node_json = ?, rationale = ?
            WHERE id = ?
            """,
            (refined.merged_node.model_dump_json(), refined.rationale, proposal_id),
        )

    return {
        "proposal_id": proposal_id,
        "rationale": refined.rationale,
        "proposed_node": refined.merged_node.model_dump(),
    }


class CustomSchemaField(BaseModel):
    key: str = Field(..., min_length=1, max_length=40)
    title: str = Field(..., min_length=1, max_length=40)
    description: str = ""


class MigratedNodeDraft(BaseModel):
    node_id: str
    new_payload: dict[str, Any]


class SchemaMigrationOutput(BaseModel):
    rationale: str = Field(..., min_length=5, max_length=300)
    migrated_nodes: list[MigratedNodeDraft]


def get_schema_evolution_status(
    domain_slug: str,
    user_id: str = "usr_default",
) -> dict[str, Any]:
    with get_conn() as conn:
        active = conn.execute(
            "SELECT * FROM domain_schemas WHERE user_id = ? AND domain_slug = ? AND is_active = 1 ORDER BY version DESC LIMIT 1",
            (user_id, domain_slug),
        ).fetchone()
        cur_ver = int(active["version"]) if active else 1
        cur_schema = json.loads(active["json_schema"]) if active else {}

        next_seed = conn.execute(
            "SELECT * FROM domain_schemas WHERE user_id = ? AND domain_slug = ? AND version > ? ORDER BY version ASC LIMIT 1",
            (user_id, domain_slug, cur_ver),
        ).fetchone()

        prof_row = conn.execute(
            "SELECT profile_json FROM user_profile WHERE id = ?",
            (user_id,),
        ).fetchone()
        profile = json.loads(prof_row["profile_json"]) if prof_row else {}
        mastery = profile.get("domain_mastery", {}).get(
            domain_slug, {"tier": 1, "actions_verified": 0}
        )
        active_count = conn.execute(
            "SELECT COUNT(*) FROM crystallized_nodes WHERE user_id = ? AND domain_slug = ? AND status = 'active'",
            (user_id, domain_slug),
        ).fetchone()[0]
        socratic_count = conn.execute(
            """
            SELECT COUNT(*) FROM socratic_logs l
            JOIN crystallized_nodes n ON l.node_id = n.id
            WHERE n.user_id = ? AND n.domain_slug = ?
            """,
            (user_id, domain_slug),
        ).fetchone()[0]

    # Build suggested fields from next seed (if v1->v2) or current schema fields
    suggested_fields: list[dict[str, str]] = []
    hint_source = json.loads(next_seed["json_schema"]) if next_seed else cur_schema
    for k, prop in (hint_source.get("properties") or {}).items():
        suggested_fields.append(
            {"key": k, "title": prop.get("title", k), "description": prop.get("description", "")}
        )

    return {
        "domain_slug": domain_slug,
        "current_version": cur_ver,
        "current_tier": int(active["mastery_tier"]) if active else 1,
        "current_schema": cur_schema,
        "next_version": cur_ver + 1,
        "suggested_fields": suggested_fields,
        "actions_verified": int(mastery.get("actions_verified", 0)),
        "socratic_logs_count": socratic_count,
        "recommended_threshold": 5,
        "active_nodes_to_migrate": active_count,
    }


def _build_dynamic_json_schema(fields: list[CustomSchemaField]) -> dict[str, Any]:
    props: dict[str, Any] = {}
    required: list[str] = []
    for f in fields:
        clean_key = f.key.strip().replace(" ", "_")
        if not clean_key:
            continue
        props[clean_key] = {
            "type": "string",
            "title": f.title.strip(),
            "description": f.description.strip() or f.title.strip(),
        }
        required.append(clean_key)
    return {
        "type": "object",
        "required": required,
        "properties": props,
        "additionalProperties": False,
    }


async def preview_schema_evolution(
    domain_slug: str,
    custom_fields: list[CustomSchemaField] | None = None,
    evolution_goal: str = "",
    user_id: str = "usr_default",
) -> dict[str, Any]:
    status = get_schema_evolution_status(domain_slug, user_id=user_id)
    from_ver = status["current_version"]
    to_ver = status["next_version"]

    if custom_fields and len(custom_fields) > 0:
        next_schema = _build_dynamic_json_schema(custom_fields)
    else:
        default_fields = [CustomSchemaField(**f) for f in status["suggested_fields"]]
        next_schema = _build_dynamic_json_schema(default_fields)

    with get_conn() as conn:
        nodes = [
            dict(r)
            for r in conn.execute(
                """
                SELECT id, title, atomic_claim, payload_json, conversion_weight
                FROM crystallized_nodes
                WHERE user_id = ? AND domain_slug = ? AND status = 'active'
                ORDER BY conversion_weight DESC, created_at DESC
                LIMIT 8
                """,
                (user_id, domain_slug),
            ).fetchall()
        ]

        # Fetch Socratic logs & Audit reflections per node for deep synthesis
        socratic_by_node: dict[str, list[dict[str, Any]]] = {}
        for r in conn.execute(
            """
            SELECT l.node_id, l.difficulty, l.question, l.user_answer, l.rating, l.feedback, l.blind_spot_note
            FROM socratic_logs l
            JOIN crystallized_nodes n ON l.node_id = n.id
            WHERE n.user_id = ? AND n.domain_slug = ?
            ORDER BY l.created_at DESC
            """,
            (user_id, domain_slug),
        ).fetchall():
            socratic_by_node.setdefault(r["node_id"], []).append(dict(r))

        audits_by_node: dict[str, list[dict[str, Any]]] = {}
        for r in conn.execute(
            """
            SELECT a.node_id, l.executed, l.outcome_score, l.user_reflection
            FROM audit_logs l
            JOIN action_experiments a ON l.action_id = a.id
            JOIN crystallized_nodes n ON a.node_id = n.id
            WHERE n.user_id = ? AND n.domain_slug = ?
            ORDER BY l.created_at DESC
            """,
            (user_id, domain_slug),
        ).fetchall():
            audits_by_node.setdefault(r["node_id"], []).append(dict(r))

    enriched_inputs = []
    for n in nodes:
        enriched_inputs.append(
            {
                **n,
                "socratic_history": socratic_by_node.get(n["id"], [])[:3],
                "audit_history": audits_by_node.get(n["id"], [])[:3],
            }
        )

    migrated_preview: list[dict[str, Any]] = []
    rationale = evolution_goal.strip() or f"自定义演进至 v{to_ver}（融合陪练与实战反馈）"

    if enriched_inputs:
        system_prompt = (
            "你是【数据结构架构师 (Schema Architect)】。你正在执行动态认知演进（L{from_ver} → L{to_ver}）。\n"
            f"目标领域：{domain_slug}，从 v{from_ver} 升级至 v{to_ver}。\n"
            f"用户指定的演进目标：{evolution_goal or '融合历史苏格拉底陪练中的用户回答、AI建议与现实审计反馈，提炼更贴合实战的新卡片内容'}。\n"
            "【核心原则 — 拒绝机械拆分】：\n"
            "1. 升级不是把旧字段拆得更细，而是将每张卡片关联的 socratic_history（用户真实回答、暴露的盲区、AI建议）和 audit_history（现实执行复盘）深度融合进新字段。\n"
            "2. 用户已掌握的部分应高密度浓缩；用户曾答错或暴露盲区的部分，必须在对应新字段中显式补齐防错边界。\n"
            f"3. 每个 new_payload 必须严格符合以下用户自定义 JSON Schema（所有字段均为字符串或目标定义类型）：\n{json.dumps(next_schema, ensure_ascii=False)}"
        )
        user_prompt = f"请结合历史陪练与审计记录，为以下 {len(enriched_inputs)} 张卡片生成 v{to_ver} 融合演进预览：\n{json.dumps(enriched_inputs, ensure_ascii=False)}"

        res = await call_structured_llm(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            response_model=SchemaMigrationOutput,
            tier="reasoning",
            user_id=user_id,
        )
        rationale = res.rationale
        node_map = {n["id"]: n for n in nodes}
        for m in res.migrated_nodes:
            if m.node_id not in node_map:
                continue
            jsonschema.validate(instance=m.new_payload, schema=next_schema)
            orig = node_map[m.node_id]
            migrated_preview.append(
                {
                    "node_id": m.node_id,
                    "title": orig["title"],
                    "old_payload": json.loads(orig["payload_json"]),
                    "new_payload": m.new_payload,
                }
            )

    prop_id = new_id("prop")
    evo_payload = {
        "from_version": from_ver,
        "to_version": to_ver,
        "from_schema": status["current_schema"],
        "to_schema": next_schema,
        "migrated_nodes": migrated_preview,
    }
    target_ids = [m["node_id"] for m in migrated_preview] or ["schema_only"]

    with get_conn() as conn:
        conn.execute(
            """
            INSERT INTO architect_proposals
            (id, user_id, domain_slug, proposal_type, target_node_ids_json, proposed_node_json, rationale, status)
            VALUES (?, ?, ?, 'evolve_schema', ?, ?, ?, 'pending')
            """,
            (
                prop_id,
                user_id,
                domain_slug,
                json.dumps(target_ids),
                json.dumps(evo_payload, ensure_ascii=False),
                rationale,
            ),
        )

    return {"proposal_id": prop_id, "rationale": rationale, **evo_payload}
