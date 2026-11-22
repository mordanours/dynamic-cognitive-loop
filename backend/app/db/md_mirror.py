from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from app.config import VAULT_DIR


def _safe_filename(text: str) -> str:
    cleaned = re.sub(r'[\\/:*?"<>|\s]+', "_", text.strip())
    return cleaned[:48].strip("_") or "node"


def export_node_markdown(
    node: dict[str, Any],
    actions: list[dict[str, Any]] | None = None,
) -> Path:
    """Mirror a crystallized node into vault/<user_id>/<folder_path>/<id>_<title>.md."""
    user_id = _safe_filename(node.get("user_id") or "usr_default")
    folder_rel = (node.get("folder_path") or node["domain_slug"]).strip("/")
    safe_parts = [_safe_filename(p) for p in folder_rel.split("/") if p.strip()]
    base_dir = VAULT_DIR / user_id
    domain_dir = base_dir.joinpath(*safe_parts) if safe_parts else (base_dir / node["domain_slug"])
    domain_dir.mkdir(parents=True, exist_ok=True)

    filename = f"{node['id']}_{_safe_filename(node.get('short_keyword') or node['title'])}.md"
    target = domain_dir / filename

    payload = (
        json.loads(node["payload_json"])
        if isinstance(node["payload_json"], str)
        else node["payload_json"]
    )

    lines = [
        "---",
        f"id: {node['id']}",
        f"domain: {node['domain_slug']}",
        f"node_type: {node.get('node_type', 'decision')}",
        f"folder_path: {folder_rel}",
        f"short_keyword: {node.get('short_keyword', '')}",
        f"schema_version: {node['schema_version']}",
        f"status: {node['status']}",
        f"confidence: {round(float(node['confidence']), 3)}",
        f"conversion_weight: {round(float(node['conversion_weight']), 3)}",
        f"created_at: {node.get('created_at', '')}",
        "---",
        "",
        f"# {node['title']}",
        "",
        f"> **核心命题**：{node['atomic_claim']}",
        "",
        "## 结构化认知载荷",
        "",
    ]

    for key, val in payload.items():
        if isinstance(val, list):
            lines.append(f"### {key}")
            for item in val:
                lines.append(f"- {json.dumps(item, ensure_ascii=False) if isinstance(item, dict) else item}")
            lines.append("")
        else:
            lines.append(f"- **{key}**: {val}")

    if actions:
        lines.extend(["", "## 关联微行动与审计状态", ""])
        for act in actions:
            lines.append(
                f"- **[{act['status']}]** 如果 `{act['trigger_condition']}` → 则 `{act['micro_action']}`"
            )

    target.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return target
