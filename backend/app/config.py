from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
VAULT_DIR = BASE_DIR.parent / "vault"
DB_PATH = DATA_DIR / "cognitive_loop.db"
LLM_SETTINGS_PATH = DATA_DIR / "llm_settings.json"

ProviderType = Literal["deepseek", "openai_compatible", "local"]


class ProviderProfile(BaseModel):
    label: str
    base_url: str
    api_key: str = ""
    fast_model: str
    reasoning_model: str


class LLMSettings(BaseModel):
    active_provider: ProviderType = "deepseek"
    profiles: dict[ProviderType, ProviderProfile] = Field(
        default_factory=lambda: {
            "deepseek": ProviderProfile(
                label="DeepSeek API",
                base_url=os.getenv("LLM_BASE_URL", "https://api.deepseek.com/v1"),
                api_key=os.getenv("LLM_API_KEY", ""),
                fast_model=os.getenv("LLM_FAST_MODEL", "deepseek-chat"),
                reasoning_model=os.getenv("LLM_REASONING_MODEL", "deepseek-chat"),
            ),
            "openai_compatible": ProviderProfile(
                label="OpenAI 兼容接口 (OpenRouter / 硅基流动 / Qwen 等)",
                base_url="https://api.openai.com/v1",
                api_key="",
                fast_model="gpt-4o-mini",
                reasoning_model="gpt-4o",
            ),
            "local": ProviderProfile(
                label="本地模型 (Ollama / LM Studio)",
                base_url="http://localhost:11434/v1",
                api_key="ollama",
                fast_model="qwen2.5:7b",
                reasoning_model="qwen2.5:14b",
            ),
        }
    )

    def current_profile(self) -> ProviderProfile:
        return self.profiles[self.active_provider]


def ensure_dirs() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    VAULT_DIR.mkdir(parents=True, exist_ok=True)


def get_llm_settings() -> LLMSettings:
    ensure_dirs()
    if LLM_SETTINGS_PATH.exists():
        try:
            raw = json.loads(LLM_SETTINGS_PATH.read_text(encoding="utf-8"))
            return LLMSettings.model_validate(raw)
        except Exception:
            pass
    settings = LLMSettings()
    save_llm_settings(settings)
    return settings


def save_llm_settings(settings: LLMSettings) -> LLMSettings:
    ensure_dirs()
    LLM_SETTINGS_PATH.write_text(
        settings.model_dump_json(indent=2),
        encoding="utf-8",
    )
    return settings
