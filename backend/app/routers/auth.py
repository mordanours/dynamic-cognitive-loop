from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.config import get_invite_code
from app.db.database import get_conn
from app.services.auth import (
    get_current_user,
    login_password_user,
    register_password_user,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


class RegisterRequest(BaseModel):
    username: str = Field(..., min_length=2, max_length=32)
    password: str = Field(..., min_length=6, max_length=64)
    nickname: str = ""
    invite_code: str = ""


class LoginRequest(BaseModel):
    username: str
    password: str


@router.get("/config")
def auth_config() -> dict:
    with get_conn() as conn:
        has_users = (
            conn.execute(
                "SELECT 1 FROM user_identities WHERE provider = 'password' LIMIT 1"
            ).fetchone()
            is not None
        )
    return {
        "invite_required": bool(get_invite_code()),
        "has_users": has_users,
    }


@router.post("/register")
def register(req: RegisterRequest) -> dict:
    try:
        return register_password_user(
            username=req.username,
            password=req.password,
            nickname=req.nickname,
            invite_code=req.invite_code,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/login")
def login(req: LoginRequest) -> dict:
    try:
        return login_password_user(req.username, req.password)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc


@router.get("/me")
def me(current_user: dict = Depends(get_current_user)) -> dict:
    return current_user
