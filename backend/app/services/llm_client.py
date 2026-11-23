from __future__ import annotations

import base64
import json
import re
from typing import Literal, Type, TypeVar

from openai import AsyncOpenAI
from pydantic import BaseModel, ValidationError

from app.config import get_llm_settings

T = TypeVar("T", bound=BaseModel)


class LLMConfigError(RuntimeError):
    """Raised when the active LLM provider is missing required credentials."""


def _extract_json_block(raw: str) -> str:
    raw = raw.strip()
    fence_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", raw)
    if fence_match:
        return fence_match.group(1).strip()
    start = raw.find("{")
    end = raw.rfind("}")
    if start != -1 and end != -1 and end > start:
        return raw[start : end + 1]
    return raw


def _build_client(
    tier: Literal["fast", "reasoning"] = "reasoning",
    user_id: str = "usr_default",
) -> tuple[AsyncOpenAI, str]:
    settings = get_llm_settings(user_id=user_id)
    profile = settings.current_profile()
    if settings.active_provider != "local" and not profile.api_key.strip():
        raise LLMConfigError(
            f"当前模型提供方 ({profile.label}) 尚未配置 API Key，请在右上角「模型设置」中填写。"
        )
    api_key = profile.api_key.strip() or "ollama"
    model = profile.fast_model if tier == "fast" else profile.reasoning_model
    client = AsyncOpenAI(
        api_key=api_key,
        base_url=profile.base_url.strip().rstrip("/"),
        timeout=60.0,
    )
    return client, model


async def call_structured_llm(
    system_prompt: str,
    user_prompt: str,
    response_model: Type[T],
    tier: Literal["fast", "reasoning"] = "reasoning",
    max_retries: int = 2,
    user_id: str = "usr_default",
) -> T:
    """Call OpenAI-compatible API and validate output into a Pydantic model."""
    client, model = _build_client(tier=tier, user_id=user_id)
    schema_hint = json.dumps(response_model.model_json_schema(), ensure_ascii=False)

    messages: list[dict[str, str]] = [
        {
            "role": "system",
            "content": (
                f"{system_prompt}\n\n"
                "【输出格式铁律】你必须且只能输出合法的 JSON 对象（不要输出任何额外解释文字），"
                f"严格符合以下 JSON Schema：\n{schema_hint}"
            ),
        },
        {"role": "user", "content": user_prompt},
    ]

    last_error: Exception | None = None
    for attempt in range(max_retries + 1):
        kwargs: dict = {
            "model": model,
            "messages": messages,
            "temperature": 0.3,
        }
        # Most OpenAI-compatible endpoints (including DeepSeek) support json_object mode
        if "reasoner" not in model.lower():
            kwargs["response_format"] = {"type": "json_object"}

        resp = await client.chat.completions.create(**kwargs)
        content = resp.choices[0].message.content or ""
        cleaned = _extract_json_block(content)

        try:
            data = json.loads(cleaned)
            return response_model.model_validate(data)
        except (json.JSONDecodeError, ValidationError) as exc:
            last_error = exc
            if attempt < max_retries:
                messages.append({"role": "assistant", "content": content})
                messages.append(
                    {
                        "role": "user",
                        "content": f"上次输出的 JSON 校验失败，错误为：{exc}。请修正并只输出合法 JSON。",
                    }
                )
            else:
                break

    raise RuntimeError(f"LLM 结构化输出校验失败（已重试 {max_retries} 次）: {last_error}")


async def test_llm_connection(user_id: str = "usr_default") -> dict[str, str]:
    client, model = _build_client(tier="fast", user_id=user_id)
    resp = await client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": "请回复 OK"}],
        max_tokens=16,
        temperature=0,
    )
    reply = (resp.choices[0].message.content or "").strip()
    return {"status": "ok", "model": model, "reply": reply}


async def extract_image_insights(
    image_bytes: bytes,
    mime_type: str,
    user_id: str = "usr_default",
) -> str:
    """Use user's configured Vision model (if enabled) to extract text, tables, and key data from an image."""
    settings = get_llm_settings(user_id=user_id)
    vision = settings.vision
    if not vision.enabled:
        return ""
    if not vision.api_key.strip() and "localhost" not in vision.base_url and "127.0.0.1" not in vision.base_url:
        return ""

    b64 = base64.b64encode(image_bytes).decode("ascii")
    client = AsyncOpenAI(
        api_key=vision.api_key.strip() or "ollama",
        base_url=vision.base_url.strip().rstrip("/"),
        timeout=60.0,
    )
    resp = await client.chat.completions.create(
        model=vision.model,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": "请完整提取这张图片中的核心文字、数据指标、对比表格（请用 Markdown 表格输出）以及图表结论，保持客观准确。",
                    },
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:{mime_type};base64,{b64}"},
                    },
                ],
            }
        ],
        max_tokens=1500,
    )
    return (resp.choices[0].message.content or "").strip()
