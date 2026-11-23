from __future__ import annotations

import json
from typing import Any, Literal

import jsonschema
from pydantic import BaseModel, Field

from app.db.database import estimate_tokens, get_conn, new_id
from app.db.md_mirror import export_node_markdown
from app.services.llm_client import call_structured_llm


class RichBlock(BaseModel):
    title: str = Field(..., min_length=1, max_length=60, description="数据块/表格标题")
    markdown: str = Field(..., min_length=3, description="保留原文本中的 GFM Markdown 表格、清单或公式")


class DistilledNodeDraft(BaseModel):
    node_type: Literal["knowledge", "decision"] = Field(
        ...,
        description="卡片功能分类：'knowledge' 表示底层原理/概念/心智模型；'decision' 表示可直接转化为行动纪律的决策规则",
    )
    folder_path: str = Field(
        ...,
        min_length=3,
        max_length=80,
        description="1~2级文件夹路径，必须以领域 slug 开头，如 'investing/仓位与择时' 或 'investing/仓位与择时/宽基定投'",
    )
    short_keyword: str = Field(
        ...,
        min_length=2,
        max_length=16,
        description="用于目录与知识树展示的精炼短语：knowledge 必须用【名词短语】，decision 必须用【动词短语】",
    )
    title: str = Field(..., min_length=2, max_length=80, description="完整卡片标题")
    atomic_claim: str = Field(..., min_length=5, max_length=240, description="一句话核心命题")
    payload: dict[str, Any] = Field(..., description="严格符合目标领域 JSON Schema 的结构化内容")
    rich_blocks: list[RichBlock] = Field(
        default_factory=list,
        max_length=3,
        description="若原文包含数据对比表、参数表、结构化清单或公式，必须在此以 GFM Markdown 表格/列表完整保留，不要丢失数据",
    )
    confidence: float = Field(default=0.65, ge=0.1, le=1.0)


class DistillationOutput(BaseModel):
    discarded_noise_summary: str = Field(
        ...,
        description="被主动丢弃的寒暄、重复铺垫与无效上下文总结（用于对抗信息囤积）",
    )
    nodes: list[DistilledNodeDraft] = Field(
        ...,
        min_length=1,
        max_length=3,
        description="强制降维提取出的 1 到 3 条原子化认知",
    )


async def distill_stream_item(
    stream_id: str,
    domain_slug: str | None = None,
    user_id: str = "usr_default",
) -> dict[str, Any]:
    with get_conn() as conn:
        stream_row = conn.execute(
            "SELECT * FROM stream_items WHERE id = ? AND user_id = ?",
            (stream_id, user_id),
        ).fetchone()
        if not stream_row:
            raise ValueError(f"未找到交互流记录: {stream_id}")

        target_domain = domain_slug or stream_row["domain_hint"] or "investing"

        schema_row = conn.execute(
            """
            SELECT * FROM domain_schemas
            WHERE user_id = ? AND domain_slug = ? AND is_active = 1
            ORDER BY version DESC LIMIT 1
            """,
            (user_id, target_domain),
        ).fetchone()
        if not schema_row:
            raise ValueError(f"未找到领域 {target_domain} 的激活 Schema")

        profile_row = conn.execute(
            "SELECT profile_json FROM user_profile WHERE id = ?",
            (user_id,),
        ).fetchone()
        profile = json.loads(profile_row["profile_json"]) if profile_row else {}

        # Fetch existing active nodes & user custom folders for consistency
        existing_rows = conn.execute(
            """
            SELECT folder_path, short_keyword, title, atomic_claim
            FROM crystallized_nodes
            WHERE user_id = ? AND domain_slug = ? AND status = 'active'
            ORDER BY conversion_weight DESC, created_at DESC
            LIMIT 15
            """,
            (user_id, target_domain),
        ).fetchall()
        folder_rows = conn.execute(
            "SELECT id, folder_name, parent_id FROM domain_folders WHERE user_id = ? AND domain_slug = ? ORDER BY is_system DESC, created_at ASC",
            (user_id, target_domain),
        ).fetchall()

    target_json_schema = json.loads(schema_row["json_schema"])
    absorption = profile.get("absorption_modality_weights", {})
    existing_context = [dict(r) for r in existing_rows]
    folder_by_id = {r["id"]: r["folder_name"] for r in folder_rows}
    user_folders = []
    for r in folder_rows:
        if r["parent_id"] and r["parent_id"] in folder_by_id:
            user_folders.append(f"{target_domain}/{folder_by_id[r['parent_id']]}/{r['folder_name']}")
        else:
            user_folders.append(f"{target_domain}/{r['folder_name']}")

    system_prompt = (
        "你是【认知降维器 (Distiller)】。你的使命是对抗上下文膨胀，把冗长对话压缩为高密度、功能清晰、无重复的原子认知。\n"
        f"目标领域：{schema_row['domain_name']} ({target_domain})，当前 Schema 版本 v{schema_row['version']}。\n"
        f"用户最佳吸收偏好权重：{json.dumps(absorption, ensure_ascii=False)}。\n"
        "严格要求：\n"
        "1. 必须丢弃所有客套话、重复解释和低信息密度内容，并在 discarded_noise_summary 中说明丢弃了什么。\n"
        "2. 只提取 1~3 条最核心的原子认知（nodes），宁缺毋滥。\n"
        "3. 【功能区分与命名铁律】：\n"
        "   - 若内容属于底层原理、概念规律、心智模型 → node_type 设为 'knowledge'，short_keyword 必须为【名词短语】（如'宽基指数自净机制'、'资产配置再平衡'）。\n"
        "   - 若内容属于操作纪律、判断准则、策略动作 → node_type 设为 'decision'，short_keyword 必须为【动词短语】（如'按三标准机械进出场'、'限定单股抄底红线'）。\n"
        f"4. 【文件夹路径归类】：folder_path 必须以 '{target_domain}/' 开头，优先归类到用户已建目录：{json.dumps(user_folders, ensure_ascii=False)}；若均不匹配，默认放入 '{target_domain}/核心认知' 或新建贴切子目录。\n"
        "5. 【防重复规则】：参考下方该领域已有结晶，严禁提取与已有卡片高度同义重复的内容；若对话包含已有观点的深化补充，请提炼其新增的差异化维度。\n"
        f"已有结晶参考：{json.dumps(existing_context, ensure_ascii=False)}\n"
        "6. 【表格与数据保留】：若原始文本中包含对比表格、关键指标数据、步骤清单或公式，必须在 rich_blocks 中用标准 GFM Markdown 表格/列表完整保留，不可被丢弃或压扁。\n"
        "7. 每条 node 的 payload 字段必须严格满足以下领域 JSON Schema（字段名、类型、必填项完全一致）：\n"
        f"{json.dumps(target_json_schema, ensure_ascii=False)}"
    )

    user_prompt = f"请对以下原始交互流内容进行强降维提炼：\n\n{stream_row['raw_content']}"

    result = await call_structured_llm(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        response_model=DistillationOutput,
        tier="reasoning",
        user_id=user_id,
    )

    for draft in result.nodes:
        jsonschema.validate(instance=draft.payload, schema=target_json_schema)

    created_nodes: list[dict[str, Any]] = []
    total_crystallized_tokens = 0

    with get_conn() as conn:
        for draft in result.nodes:
            payload_str = json.dumps(draft.payload, ensure_ascii=False)
            total_crystallized_tokens += estimate_tokens(
                draft.title + draft.atomic_claim + payload_str
            )

        raw_tokens = max(1, int(stream_row["token_count"]))
        compression_ratio = round(raw_tokens / max(1, total_crystallized_tokens), 2)

        for draft in result.nodes:
            node_id = new_id("node")
            payload_str = json.dumps(draft.payload, ensure_ascii=False)
            rich_blocks_str = json.dumps(
                [b.model_dump() for b in draft.rich_blocks], ensure_ascii=False
            )
            clean_path = draft.folder_path.strip("/")
            if not clean_path.startswith(f"{target_domain}/"):
                clean_path = f"{target_domain}/{clean_path.split('/')[-1] or '核心认知'}"
            # Enforce max 2 folder levels under domain_slug
            parts = clean_path.split("/")
            if len(parts) > 3:
                clean_path = "/".join(parts[:3])

            conn.execute(
                """
                INSERT INTO crystallized_nodes
                (id, user_id, domain_slug, schema_version, node_type, folder_path, short_keyword,
                 title, atomic_claim, payload_json, rich_blocks_json, attachment_ids_json,
                 confidence, conversion_weight, status, source_stream_ids, discarded_noise, compression_ratio)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
                """,
                (
                    node_id,
                    user_id,
                    target_domain,
                    schema_row["version"],
                    draft.node_type,
                    clean_path,
                    draft.short_keyword.strip(),
                    draft.title,
                    draft.atomic_claim,
                    payload_str,
                    rich_blocks_str,
                    stream_row["attachment_ids_json"] if "attachment_ids_json" in stream_row.keys() else "[]",
                    draft.confidence,
                    0.5,
                    json.dumps([stream_id]),
                    result.discarded_noise_summary,
                    compression_ratio,
                ),
            )
            row = conn.execute(
                "SELECT * FROM crystallized_nodes WHERE id = ?", (node_id,)
            ).fetchone()
            node_dict = dict(row)
            export_node_markdown(node_dict)
            created_nodes.append(node_dict)

        conn.execute(
            "UPDATE stream_items SET status = 'crystallized' WHERE id = ? AND user_id = ?",
            (stream_id, user_id),
        )

    return {
        "stream_id": stream_id,
        "domain_slug": target_domain,
        "schema_version": schema_row["version"],
        "discarded_noise_summary": result.discarded_noise_summary,
        "compression_ratio": compression_ratio,
        "nodes": created_nodes,
    }
