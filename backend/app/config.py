from __future__ import annotations

import base64
import hashlib
import json
import os
import secrets
from pathlib import Path
from typing import Literal

from cryptography.fernet import Fernet
from pydantic import BaseModel, Field

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.getenv("COGNITIVE_DATA_DIR", str(BASE_DIR / "data")))
VAULT_DIR = Path(os.getenv("COGNITIVE_VAULT_DIR", str(BASE_DIR.parent / "vault")))
DB_PATH = DATA_DIR / "cognitive_loop.db"
LLM_SETTINGS_PATH = DATA_DIR / "llm_settings.json"

ProviderType = Literal["deepseek", "openai_compatible", "local"]


def ensure_dirs() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    VAULT_DIR.mkdir(parents=True, exist_ok=True)


def _load_or_create_secret(filename: str, env_var: str) -> str:
    val = os.getenv(env_var, "").strip()
    if val:
        return val
    ensure_dirs()
    secret_file = DATA_DIR / filename
    if secret_file.exists():
        return secret_file.read_text(encoding="utf-8").strip()
    generated = secrets.token_urlsafe(48)
    secret_file.write_text(generated, encoding="utf-8")
    return generated


def get_jwt_secret() -> str:
    return _load_or_create_secret(".jwt_secret", "JWT_SECRET")


def get_invite_code() -> str:
    return os.getenv("INVITE_CODE", "").strip()


def _get_fernet() -> Fernet:
    raw = _load_or_create_secret(".fernet_secret", "FERNET_KEY")
    digest = hashlib.sha256(raw.encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_secret(plaintext: str) -> str:
    if not plaintext:
        return ""
    return _get_fernet().encrypt(plaintext.encode("utf-8")).decode("utf-8")


def decrypt_secret(ciphertext: str) -> str:
    if not ciphertext:
        return ""
    try:
        return _get_fernet().decrypt(ciphertext.encode("utf-8")).decode("utf-8")
    except Exception:
        return ""


class ProviderProfile(BaseModel):
    label: str
    base_url: str
    api_key: str = ""
    fast_model: str
    reasoning_model: str


class VisionConfig(BaseModel):
    enabled: bool = False
    base_url: str = "https://api.openai.com/v1"
    api_key: str = ""
    model: str = "gpt-4o-mini"


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
    vision: VisionConfig = Field(default_factory=VisionConfig)

    def current_profile(self) -> ProviderProfile:
        return self.profiles[self.active_provider]


def get_llm_settings(user_id: str = "usr_default") -> LLMSettings:
    from app.db.database import get_conn

    ensure_dirs()
    try:
        with get_conn() as conn:
            row = conn.execute(
                "SELECT settings_json FROM user_llm_settings WHERE user_id = ?",
                (user_id,),
            ).fetchone()
            if row:
                data = json.loads(row["settings_json"])
                for prof in data.get("profiles", {}).values():
                    if prof.get("api_key_enc"):
                        prof["api_key"] = decrypt_secret(prof.pop("api_key_enc"))
                if data.get("vision", {}).get("api_key_enc"):
                    data["vision"]["api_key"] = decrypt_secret(data["vision"].pop("api_key_enc"))
                return LLMSettings.model_validate(data)
    except Exception:
        pass

    # Legacy fallback for initial usr_default migration
    if user_id == "usr_default" and LLM_SETTINGS_PATH.exists():
        try:
            raw = json.loads(LLM_SETTINGS_PATH.read_text(encoding="utf-8"))
            settings = LLMSettings.model_validate(raw)
            save_llm_settings(settings, user_id=user_id)
            return settings
        except Exception:
            pass

    return LLMSettings()


def save_llm_settings(settings: LLMSettings, user_id: str = "usr_default") -> LLMSettings:
    from app.db.database import get_conn

    ensure_dirs()
    data = settings.model_dump()
    for prof in data["profiles"].values():
        plain = prof.pop("api_key", "")
        prof["api_key_enc"] = encrypt_secret(plain)
    if "vision" in data:
        v_plain = data["vision"].pop("api_key", "")
        data["vision"]["api_key_enc"] = encrypt_secret(v_plain)

    with get_conn() as conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO user_llm_settings (user_id, settings_json, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
            """,
            (user_id, json.dumps(data, ensure_ascii=False)),
        )
    return settings
