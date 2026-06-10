from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.api.v1 import files


@pytest.mark.asyncio
async def test_download_file_adds_zip_extension_for_zip_objects(monkeypatch):
    file_id = "de726c12-9ad6-43ba-b2b6-12a81e4fcaeb"

    def _stat_object(object_name: str):
        if object_name == f"files/{file_id}":
            return SimpleNamespace(content_type="application/zip", size=128)
        raise FileNotFoundError(object_name)

    monkeypatch.setattr(files.storage, "stat_object", _stat_object)
    monkeypatch.setattr(files.storage, "get_file", lambda _object_name: b"PK\x03\x04zip")

    response = await files.download_file(file_id)

    assert response.media_type == "application/zip"
    assert response.headers["content-disposition"] == (
        f'attachment; filename="{file_id}.zip"'
    )


@pytest.mark.asyncio
async def test_download_file_honors_safe_preferred_filename(monkeypatch):
    file_id = "de726c12-9ad6-43ba-b2b6-12a81e4fcaeb"

    monkeypatch.setattr(
        files.storage,
        "stat_object",
        lambda _object_name: SimpleNamespace(content_type="application/zip", size=128),
    )
    monkeypatch.setattr(files.storage, "get_file", lambda _object_name: b"PK\x03\x04zip")

    response = await files.download_file(file_id, filename="source.zip")

    assert response.headers["content-disposition"] == 'attachment; filename="source.zip"'


@pytest.mark.asyncio
async def test_preview_file_converts_octet_stream_pptx_when_filename_hint_is_present(monkeypatch):
    file_id = "de726c12-9ad6-43ba-b2b6-12a81e4fcaeb"
    calls: list[tuple[bytes, str]] = []
    uploads: list[tuple[bytes, str, str]] = []

    def _stat_object(object_name: str):
        if object_name == f"files/{file_id}":
            return SimpleNamespace(content_type="application/octet-stream", size=128)
        raise FileNotFoundError(object_name)

    def _get_file(object_name: str):
        assert object_name == f"files/{file_id}"
        return b"pptx-bytes"

    def _convert(file_bytes: bytes, filename: str):
        calls.append((file_bytes, filename))
        return b"%PDF-1.4 converted"

    def _upload(content: bytes, object_name: str, content_type: str):
        uploads.append((content, object_name, content_type))
        return object_name

    monkeypatch.setattr(files.storage, "stat_object", _stat_object)
    monkeypatch.setattr(files.storage, "get_file", _get_file)
    monkeypatch.setattr(files.storage, "upload_file", _upload)
    monkeypatch.setattr(files, "convert_bytes_sync_or_raise", _convert)

    response = await files.preview_file(file_id, filename="slides.pptx")

    assert response.media_type == "application/pdf"
    assert response.headers["content-disposition"] == 'inline; filename="preview.pdf"'
    assert calls == [(b"pptx-bytes", "slides.pptx")]
    assert uploads == [
        (b"%PDF-1.4 converted", f"conversions/{file_id}.pdf", "application/pdf")
    ]


@pytest.mark.asyncio
async def test_preview_file_reports_converter_service_unavailable(monkeypatch):
    file_id = "de726c12-9ad6-43ba-b2b6-12a81e4fcaeb"

    def _stat_object(object_name: str):
        if object_name == f"files/{file_id}":
            return SimpleNamespace(content_type="application/octet-stream", size=128)
        raise FileNotFoundError(object_name)

    monkeypatch.setattr(files.storage, "stat_object", _stat_object)
    monkeypatch.setattr(files.storage, "get_file", lambda _object_name: b"pptx-bytes")

    def _convert(_file_bytes: bytes, _filename: str):
        raise files.ConversionError(
            "Document conversion service is unavailable. Start Gotenberg.",
            service_unavailable=True,
        )

    monkeypatch.setattr(files, "convert_bytes_sync_or_raise", _convert)

    with pytest.raises(files.HTTPException) as exc_info:
        await files.preview_file(file_id, filename="slides.pptx")

    assert exc_info.value.status_code == 503
    assert "Start Gotenberg" in exc_info.value.detail
