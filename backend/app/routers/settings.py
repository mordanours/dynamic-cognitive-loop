from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.config import LLMSettings, get_llm_settings, save_llm_settings
from app.services.auth import get_current_user
from app.services.llm_client import LLMConfigError, test_llm_connection

router = APIRouter(prefix="/api/settings", tags=["settings"])


def _mask_settings(settings: LLMSettings) -> dict:
    data = settings.model_dump()
    for p in data["profiles"].values():
        key = p.get("api_key", "")
        p["has_api_key"] = bool(key and key != "ollama")
        if len(key) > 8:
            p["api_key_masked"] = f"{key[:4]}...{key[-4:]}"
        elif key:
            p["api_key_masked"] = "****"
        else:
            p["api_key_masked"] = ""
    return data


@router.get("/llm")
def get_llm_config(current_user: dict = Depends(get_current_user)) -> dict:
    return _mask_settings(get_llm_settings(user_id=current_user["id"]))


@router.put("/llm")
def update_llm_config(
    new_settings: LLMSettings,
    current_user: dict = Depends(get_current_user),
) -> dict:
    user_id = current_user["id"]
    existing = get_llm_settings(user_id=user_id)
    for provider_key, profile in new_settings.profiles.items():
        if profile.api_key == "__KEEP__":
            profile.api_key = existing.profiles[provider_key].api_key
    saved = save_llm_settings(new_settings, user_id=user_id)
    return _mask_settings(saved)


@router.post("/llm/test")
async def test_llm_endpoint(current_user: dict = Depends(get_current_user)) -> dict:
    try:
        return await test_llm_connection(user_id=current_user["id"])
    except LLMConfigError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"连接测试失败: {exc}") from exc
