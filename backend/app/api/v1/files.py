from __future__ import annotations

import uuid
import asyncio
import mimetypes
import logging
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse, Response

from app.core.config import settings
from app.api.deps import get_current_user_id
from app.schemas.file import (
    FileUploadResponse,
    FileInfoResponse,
    UpdateContentRequest,
    ApplyDiffRequest,
    ApplyDiffResponse,
    PreviewPublishRequest,
    PreviewPublishResponse,
)
from app.services import storage

logger = logging.getLogger("agenthub.files")
router = APIRouter()


@router.post("/upload", response_model=FileUploadResponse)
async def upload_file(
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user_id),
):
    content = await file.read()
    file_id = str(uuid.uuid4())
    content_type = file.content_type or "application/octet-stream"
    filename = file.filename or "unnamed"

    object_name = f"files/{file_id}"
    storage.upload_file(content, object_name, content_type)

    url = f"/api/v1/files/{file_id}/download"

    # ── PPTX → PDF conversion via Gotenberg ──
    preview_url: str | None = None
    preview_file_id: str | None = None

    _pptx_mimes = (
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "application/vnd.ms-powerpoint",
    )
    is_pptx = content_type in _pptx_mimes or (
        content_type == "application/octet-stream"
        and (filename or "").lower().endswith((".pptx", ".ppt"))
    )

    if is_pptx:
        try:
            from app.services.converter import convert_bytes_sync

            pdf_bytes = await asyncio.get_event_loop().run_in_executor(
                None, lambda: convert_bytes_sync(content, filename)
            )
            if pdf_bytes:
                preview_file_id = str(uuid.uuid4())
                await asyncio.get_event_loop().run_in_executor(
                    None,
                    lambda: storage.upload_file(
                        pdf_bytes,
                        f"conversions/{preview_file_id}.pdf",
                        "application/pdf",
                    ),
                )
                preview_url = f"/api/v1/files/{preview_file_id}/download"
                logger.info(
                    "PPTX uploaded and converted: %s → preview %s", filename, preview_url
                )
        except Exception:
            logger.exception("PPTX upload conversion failed: %s", filename)

    return FileUploadResponse(
        id=file_id,
        url=url,
        filename=filename,
        size=len(content),
        mime_type=content_type,
        preview_url=preview_url,
        preview_file_id=preview_file_id,
    )


@router.get("/{file_id}", response_model=FileInfoResponse)
async def get_file_info(
    file_id: str,
    user_id: str = Depends(get_current_user_id),
):
    url = f"/api/v1/files/{file_id}/download"
    for prefix, suffix, fallback_mime in [
        ("files/", "", None),
        ("previews/", ".html", "text/html"),
        ("conversions/", ".pdf", "application/pdf"),
    ]:
        try:
            obj = storage.stat_object(f"{prefix}{file_id}{suffix}")
            return FileInfoResponse(
                url=url,
                fileName=file_id + suffix,
                mimeType=fallback_mime or obj.content_type or "application/octet-stream",
                fileSize=obj.size or 0,
            )
        except FileNotFoundError:
            continue
    raise HTTPException(status_code=404, detail="File not found")


@router.get("/{file_id}/download")
async def download_file(
    file_id: str,
):
    import mimetypes as _mimetypes
    content = None
    media_type = "application/octet-stream"
    disposition = "attachment"

    # Try MinIO stat to get the real content-type; fall back to extension sniffing
    for prefix, suffix in [("files/", ""), ("previews/", ".html"), ("conversions/", ".pdf")]:
        try:
            obj = storage.stat_object(f"{prefix}{file_id}{suffix}")
            content = storage.get_file(f"{prefix}{file_id}{suffix}")
            media_type = obj.content_type or "application/octet-stream"
            disposition = "attachment"
            # Inline-renderable types: let the browser display them directly
            if media_type in ("application/pdf",) or media_type.startswith("image/"):
                disposition = "inline"
            break
        except FileNotFoundError:
            continue

    if content is None:
        raise HTTPException(status_code=404, detail="File not found")

    return StreamingResponse(
        iter([content]),
        media_type=media_type,
        headers={"Content-Disposition": f'{disposition}; filename="{file_id}{suffix}"'},
    )


@router.head("/{file_id}/download")
async def head_download(
    file_id: str,
):
    """Handle HEAD requests — return headers only (no body).

    Browsers send HEAD before loading iframes to probe Content-Type and
    Content-Disposition. Without this, the 405 causes PDF iframe delay.
    """
    content_length: int | None = None
    media_type = "application/octet-stream"
    disposition = "attachment"
    suffix = ""

    for prefix, sfx in [("files/", ""), ("previews/", ".html"), ("conversions/", ".pdf")]:
        try:
            obj = storage.stat_object(f"{prefix}{file_id}{sfx}")
            media_type = obj.content_type or "application/octet-stream"
            content_length = obj.size or 0
            suffix = sfx
            if media_type in ("application/pdf",) or media_type.startswith("image/"):
                disposition = "inline"
            break
        except FileNotFoundError:
            continue

    if content_length is None:
        raise HTTPException(status_code=404, detail="File not found")

    return Response(
        status_code=200,
        headers={
            "Content-Type": media_type,
            "Content-Length": str(content_length),
            "Content-Disposition": f'{disposition}; filename="{file_id}{suffix}"',
        },
    )


@router.get("/{file_id}/preview")
async def preview_file(
    file_id: str,
):
    """Serve a file optimized for inline preview.

    For PPTX/PPT files, auto-converts to PDF via Gotenberg (with caching).
    For other files, serves with inline disposition when browser-renderable.
    Falls back to the regular download endpoint if conversion fails.
    """
    _pptx_mimes = (
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "application/vnd.ms-powerpoint",
    )

    # 1) Check for a cached conversion first
    try:
        obj = storage.stat_object(f"conversions/{file_id}.pdf")
        content = storage.get_file(f"conversions/{file_id}.pdf")
        logger.info("Serving cached PPTX→PDF preview: %s", file_id)
        return StreamingResponse(
            iter([content]),
            media_type="application/pdf",
            headers={
                "Content-Disposition": 'inline; filename="preview.pdf"',
                "Cache-Control": "public, max-age=3600",
            },
        )
    except FileNotFoundError:
        pass

    # 2) Try to read the original file
    content = None
    media_type = "application/octet-stream"
    original_suffix = ""

    for prefix, suffix in [("files/", ""), ("conversions/", ".pdf")]:
        try:
            obj = storage.stat_object(f"{prefix}{file_id}{suffix}")
            content = storage.get_file(f"{prefix}{file_id}{suffix}")
            media_type = obj.content_type or "application/octet-stream"
            original_suffix = suffix
            break
        except FileNotFoundError:
            continue

    if content is None:
        raise HTTPException(status_code=404, detail="File not found")

    # 3) If it's a PPTX file, convert to PDF
    is_pptx = media_type in _pptx_mimes or (
        media_type == "application/octet-stream"
        and file_id.lower().endswith((".pptx", ".ppt"))
    )

    if is_pptx:
        try:
            from app.services.converter import convert_bytes_sync

            pdf_bytes = await asyncio.get_event_loop().run_in_executor(
                None, lambda: convert_bytes_sync(content, f"{file_id}{original_suffix}")
            )
            if pdf_bytes:
                # Cache the conversion for future requests
                await asyncio.get_event_loop().run_in_executor(
                    None,
                    lambda: storage.upload_file(
                        pdf_bytes,
                        f"conversions/{file_id}.pdf",
                        "application/pdf",
                    ),
                )
                logger.info("PPTX→PDF preview converted and cached: %s", file_id)
                return StreamingResponse(
                    iter([pdf_bytes]),
                    media_type="application/pdf",
                    headers={
                        "Content-Disposition": 'inline; filename="preview.pdf"',
                        "Cache-Control": "public, max-age=3600",
                    },
                )
        except Exception:
            logger.exception("PPTX preview conversion failed: %s", file_id)

    # 4) Fallback: serve with inline disposition for browser-renderable types
    disposition = "attachment"
    if media_type in ("application/pdf",) or media_type.startswith("image/"):
        disposition = "inline"

    return StreamingResponse(
        iter([content]),
        media_type=media_type,
        headers={"Content-Disposition": f'{disposition}; filename="{file_id}{original_suffix}"'},
    )


@router.put("/{file_id}/content")
async def update_file_content(
    file_id: str,
    data: UpdateContentRequest,
    user_id: str = Depends(get_current_user_id),
):
    object_name = f"files/{file_id}"
    storage.upload_file(data.content.encode("utf-8"), object_name, "text/plain")
    return {"status": "updated"}


@router.post("/apply-diff", response_model=ApplyDiffResponse)
async def apply_diff(
    data: ApplyDiffRequest,
    user_id: str = Depends(get_current_user_id),
):
    file_id = str(uuid.uuid4())
    content_type, _ = mimetypes.guess_type(data.fileName)
    content_type = content_type or "text/plain"

    object_name = f"files/{file_id}"
    storage.upload_file(data.code.encode("utf-8"), object_name, content_type)

    download_url = f"/api/v1/files/{file_id}/download"
    return ApplyDiffResponse(fileId=file_id, downloadUrl=download_url)


@router.post("/preview", response_model=PreviewPublishResponse)
async def publish_preview(
    data: PreviewPublishRequest,
    user_id: str = Depends(get_current_user_id),
):
    preview_id = str(uuid.uuid4())
    object_name = f"previews/{preview_id}.html"
    storage.upload_file(data.html.encode("utf-8"), object_name, "text/html")

    preview_url = f"{settings.PREVIEW_SERVER_URL}/preview/{preview_id}"
    return PreviewPublishResponse(previewId=preview_id, url=preview_url)
