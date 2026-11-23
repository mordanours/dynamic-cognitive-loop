from __future__ import annotations

import io
import re
from pathlib import Path

import docx
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pypdf import PdfReader

from app.config import DATA_DIR
from app.db.database import get_conn, new_id
from app.services.auth import get_current_user
from app.services.llm_client import extract_image_insights

router = APIRouter(prefix="/api/files", tags=["files"])

MAX_FILE_BYTES = 10 * 1024 * 1024  # 10 MB
IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
TEXT_EXTS = {".txt", ".md", ".csv"}


def _safe_name(name: str) -> str:
    cleaned = re.sub(r'[\\/:*?"<>|\s]+', "_", name.strip())
    return cleaned[-64:] or "upload"


def _extract_docx_text(raw: bytes) -> str:
    doc = docx.Document(io.BytesIO(raw))
    parts: list[str] = []
    for p in doc.paragraphs:
        if p.text.strip():
            parts.append(p.text.strip())
    for table in doc.tables:
        rows_md: list[str] = []
        for idx, row in enumerate(table.rows):
            cells = [c.text.strip().replace("\n", " ") for c in row.cells]
            rows_md.append("| " + " | ".join(cells) + " |")
            if idx == 0:
                rows_md.append("| " + " | ".join("---" for _ in cells) + " |")
        if rows_md:
            parts.append("\n".join(rows_md))
    return "\n\n".join(parts)


def _extract_pdf_text(raw: bytes) -> str:
    reader = PdfReader(io.BytesIO(raw))
    pages = []
    for i, page in enumerate(reader.pages[:30]):
        txt = (page.extract_text() or "").strip()
        if txt:
            pages.append(f"[Page {i + 1}]\n{txt}")
    return "\n\n".join(pages)


@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
) -> dict:
    user_id = current_user["id"]
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="上传文件为空")
    if len(raw) > MAX_FILE_BYTES:
        raise HTTPException(status_code=400, detail="文件大小不能超过 10MB")

    filename = file.filename or "upload"
    ext = Path(filename).suffix.lower()
    content_type = file.content_type or "application/octet-stream"
    is_image = ext in IMAGE_EXTS or content_type.startswith("image/")

    extracted_text = ""
    vision_used = False

    if is_image:
        mime = content_type if content_type.startswith("image/") else f"image/{ext.lstrip('.') or 'png'}"
        try:
            extracted_text = await extract_image_insights(raw, mime, user_id=user_id)
            vision_used = bool(extracted_text)
        except Exception as exc:
            extracted_text = f"[图片识图失败: {exc}]"
    elif ext in TEXT_EXTS:
        try:
            extracted_text = raw.decode("utf-8")
        except UnicodeDecodeError:
            extracted_text = raw.decode("gbk", errors="replace")
    elif ext == ".pdf":
        extracted_text = _extract_pdf_text(raw)
    elif ext == ".docx":
        extracted_text = _extract_docx_text(raw)
    else:
        raise HTTPException(
            status_code=400,
            detail="暂不支持该格式。支持：PDF / Word(.docx) / Markdown / TXT / CSV / 图片(PNG/JPG/WEBP)",
        )

    file_id = new_id("file")
    upload_dir = DATA_DIR / "uploads" / user_id
    upload_dir.mkdir(parents=True, exist_ok=True)
    storage_path = upload_dir / f"{file_id}_{_safe_name(filename)}"
    storage_path.write_bytes(raw)

    with get_conn() as conn:
        conn.execute(
            """
            INSERT INTO uploaded_files
            (id, user_id, filename, content_type, file_size, storage_path, extracted_text, is_image)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                file_id,
                user_id,
                filename,
                content_type,
                len(raw),
                str(storage_path),
                extracted_text,
                1 if is_image else 0,
            ),
        )

    return {
        "file_id": file_id,
        "filename": filename,
        "content_type": content_type,
        "is_image": is_image,
        "extracted_text": extracted_text,
        "vision_used": vision_used,
    }


@router.get("/{file_id}")
def get_uploaded_file(
    file_id: str,
    current_user: dict = Depends(get_current_user),
) -> FileResponse:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM uploaded_files WHERE id = ? AND user_id = ?",
            (file_id, current_user["id"]),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="文件不存在或无权访问")

    path = Path(row["storage_path"])
    if not path.exists():
        raise HTTPException(status_code=404, detail="文件已丢失")

    return FileResponse(
        path=path,
        media_type=row["content_type"],
        filename=row["filename"],
    )
