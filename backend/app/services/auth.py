from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import get_invite_code, get_jwt_secret
from app.db.database import get_conn, new_id, seed_user_defaults

_bearer = HTTPBearer(auto_error=False)
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_DAYS = 30


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    dk = hashlib.scrypt(password.encode("utf-8"), salt=salt.encode("utf-8"), n=16384, r=8, p=1)
    return f"{salt}${dk.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        salt, expected_hex = stored_hash.split("$", 1)
        dk = hashlib.scrypt(
            password.encode("utf-8"), salt=salt.encode("utf-8"), n=16384, r=8, p=1
        )
        return hmac.compare_digest(dk.hex(), expected_hex)
    except Exception:
        return False


def create_access_token(user_id: str, role: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(days=JWT_EXPIRE_DAYS)).timestamp()),
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> dict[str, Any]:
    if not creds or not creds.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="未登录或登录已过期，请先登录",
        )
    try:
        payload = jwt.decode(
            creds.credentials, get_jwt_secret(), algorithms=[JWT_ALGORITHM]
        )
        user_id = payload.get("sub")
        if not user_id:
            raise ValueError("missing sub")
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效的认证令牌，请重新登录",
        ) from exc

    with get_conn() as conn:
        user = conn.execute(
            "SELECT id, nickname, role, is_active FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
    if not user or not user["is_active"]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户不存在或已禁用",
        )
    return dict(user)


def register_password_user(
    username: str,
    password: str,
    nickname: str = "",
    invite_code: str = "",
) -> dict[str, Any]:
    clean_user = username.strip().lower()
    if len(clean_user) < 2:
        raise ValueError("用户名至少需要 2 个字符")
    if len(password) < 6:
        raise ValueError("密码至少需要 6 个字符")

    required_invite = get_invite_code()
    if required_invite and invite_code.strip() != required_invite:
        raise ValueError("邀请码无效，请联系管理员获取邀请码")

    pw_hash = hash_password(password)
    display_name = nickname.strip() or username.strip()

    with get_conn() as conn:
        exists = conn.execute(
            "SELECT id FROM user_identities WHERE provider = 'password' AND identifier = ?",
            (clean_user,),
        ).fetchone()
        if exists:
            raise ValueError(f"用户名 '{clean_user}' 已被注册")

        # If no password users exist yet, let the very first registered user adopt 'usr_default'
        # so local pre-existing cognitive cards & audits seamlessly belong to them as admin!
        any_pw_user = conn.execute(
            "SELECT id FROM user_identities WHERE provider = 'password' LIMIT 1"
        ).fetchone()

        if not any_pw_user:
            user_id = "usr_default"
            role = "admin"
            conn.execute(
                """
                INSERT OR REPLACE INTO users (id, nickname, role, is_active)
                VALUES (?, ?, 'admin', 1)
                """,
                (user_id, display_name),
            )
            seed_user_defaults(conn, user_id)
        else:
            user_id = new_id("usr")
            role = "user"
            conn.execute(
                "INSERT INTO users (id, nickname, role, is_active) VALUES (?, ?, 'user', 1)",
                (user_id, display_name),
            )
            seed_user_defaults(conn, user_id)

        conn.execute(
            """
            INSERT INTO user_identities (id, user_id, provider, identifier, secret_hash)
            VALUES (?, ?, 'password', ?, ?)
            """,
            (new_id("idt"), user_id, clean_user, pw_hash),
        )

    token = create_access_token(user_id, role)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {"id": user_id, "username": clean_user, "nickname": display_name, "role": role},
    }


def login_password_user(username: str, password: str) -> dict[str, Any]:
    clean_user = username.strip().lower()
    with get_conn() as conn:
        row = conn.execute(
            """
            SELECT i.user_id, i.secret_hash, u.nickname, u.role, u.is_active
            FROM user_identities i
            JOIN users u ON i.user_id = u.id
            WHERE i.provider = 'password' AND i.identifier = ?
            """,
            (clean_user,),
        ).fetchone()

    if not row or not row["is_active"] or not verify_password(password, row["secret_hash"] or ""):
        raise ValueError("用户名或密码错误")

    token = create_access_token(row["user_id"], row["role"])
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": row["user_id"],
            "username": clean_user,
            "nickname": row["nickname"],
            "role": row["role"],
        },
    }
