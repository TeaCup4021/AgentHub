from __future__ import annotations

import uuid
import mimetypes
import logging
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse

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
    return FileUploadResponse(
        id=file_id,
        url=url,
        filename=filename,
        size=len(content),
        mime_type=content_type,
    )


@router.get("/{file_id}", response_model=FileInfoResponse)
async def get_file_info(
    file_id: str,
    user_id: str = Depends(get_current_user_id),
):
    url = f"/api/v1/files/{file_id}/download"
    return FileInfoResponse(url=url, fileName="", mimeType="", fileSize=0)


@router.get("/{file_id}/download")
async def download_file(
    file_id: str,
    user_id: str = Depends(get_current_user_id),
):
    try:
        content = storage.get_file(f"files/{file_id}")
    except Exception:
        try:
            content = storage.get_file(f"previews/{file_id}.html")
        except Exception:
            raise HTTPException(status_code=404, detail="File not found")

    return StreamingResponse(
        iter([content]),
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{file_id}"'},
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
