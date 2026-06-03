from __future__ import annotations

from pydantic import BaseModel


class FileUploadResponse(BaseModel):
    id: str
    url: str
    filename: str
    size: int
    mime_type: str
    width: int | None = None
    height: int | None = None


class FileInfoResponse(BaseModel):
    url: str
    fileName: str
    mimeType: str
    fileSize: int


class UpdateContentRequest(BaseModel):
    content: str


class ApplyDiffRequest(BaseModel):
    fileName: str
    code: str
    language: str = "text"


class ApplyDiffResponse(BaseModel):
    fileId: str
    downloadUrl: str


class PreviewPublishRequest(BaseModel):
    html: str
    title: str | None = None


class PreviewPublishResponse(BaseModel):
    previewId: str
    url: str
