from types import SimpleNamespace

import pytest

from app.services.adapters.cli_adapter import (
    _CLI_EMPTY_RESPONSE_MESSAGE,
    _collect_static_deploy_files_from_paths,
    _emit_cli_generated_html_artifacts,
    _extract_referenced_static_paths,
    _filter_local_file_artifacts,
    _filter_stray_deploy_status_artifacts,
    _is_deployment_request,
    _is_presentation_request,
    _sanitize_cli_deployment_links,
    CliAdapter,
)
from app.services.adk.cli_runner import (
    _DEFAULT_ISOLATED_WORKSPACE,
    _PROJECT_ROOT,
    _resolve_cli_workspace,
)


def test_collects_referenced_existing_static_files_even_when_not_recent(tmp_path):
    site_dir = tmp_path / "hello-world"
    site_dir.mkdir()
    (site_dir / "index.html").write_text("<!doctype html><title>Hello XUPT</title>", encoding="utf-8")
    (site_dir / "xupt.html").write_text("<!doctype html><title>XUPT</title>", encoding="utf-8")

    output = (
        "The Hello XUPT Welcome page already exists at `hello-world/index.html`.\n"
        "You can open http://localhost:8080/index.html or http://localhost:8080/xupt.html."
    )
    paths = _extract_referenced_static_paths(output)
    files = _collect_static_deploy_files_from_paths(
        SimpleNamespace(_workspace_dir=str(tmp_path)),
        paths,
    )

    assert "index.html" in files
    assert "xupt.html" in files
    assert "Hello XUPT" in files["index.html"]


def test_collect_deploy_files_accepts_preview_html_source():
    from app.services.adapters.cli_adapter import _collect_deploy_files_from_artifacts

    files = _collect_deploy_files_from_artifacts([
        {
            "artifactType": "preview",
            "content": {"html": "<!doctype html><h1>Bye, XUPT</h1>"},
        }
    ])

    assert files == {"index.html": "<!doctype html><h1>Bye, XUPT</h1>"}


def test_ppt_prompt_is_not_treated_as_deployment_request():
    assert not _is_deployment_request(
        "\u5236\u4f5c\u4e00\u4e2appt\u4ecb\u7ecd\u4e00\u4e0b\u897f\u5b89\u90ae\u7535\u5927\u5b66",
        "",
        [],
    )


def test_ppt_prompt_is_treated_as_presentation_request():
    assert _is_presentation_request(
        "\u5236\u4f5c\u4e00\u4e2appt\u4ecb\u7ecd\u4e00\u4e0b\u897f\u5b89"
    )


def test_filters_stray_deploy_status_for_non_deploy_prompt():
    artifacts = [
        {
            "artifactType": "deploy_status",
            "content": {"status": "building", "url": "DEPLOY_REQUEST"},
        },
        {
            "artifactType": "document",
            "content": {"fileName": "xupt.pptx", "fileType": "pptx"},
        },
    ]

    filtered = _filter_stray_deploy_status_artifacts(
        artifacts,
        allow_deploy_status=False,
    )

    assert [artifact["artifactType"] for artifact in filtered] == ["document"]


def test_filters_local_file_document_artifacts():
    artifacts = [
        {
            "artifactType": "document",
            "content": {
                "fileName": "Beijing_Presentation.pptx",
                "fileUrl": "file:///C:/Users/wolves/.agenthub/cli_workspace/Beijing_Presentation.pptx",
                "fileType": "pptx",
            },
        },
        {
            "artifactType": "document",
            "content": {
                "fileName": "Beijing_Presentation.pptx",
                "fileUrl": "/api/v1/files/ppt-id/download",
                "fileType": "pptx",
            },
        },
    ]

    filtered = _filter_local_file_artifacts(artifacts)

    assert len(filtered) == 1
    assert filtered[0]["content"]["fileUrl"] == "/api/v1/files/ppt-id/download"


@pytest.mark.asyncio
async def test_pptx_generation_emits_original_and_pdf_cards(tmp_path, monkeypatch):
    from datetime import datetime, timezone
    from app.services.adapters import cli_adapter as cli_adapter_module
    from app.services import artifact_detector as artifact_detector_module
    from app.services import storage as storage_module

    pptx = tmp_path / "demo.pptx"
    pptx.write_bytes(b"PK\x03\x04 fake pptx")
    uploads: list[tuple[bytes, str, str]] = []

    def _upload(content, object_name, content_type):
        uploads.append((content, object_name, content_type))

    async def _convert(doc_url, file_type, name):
        assert doc_url.startswith("/api/v1/files/")
        assert file_type == "pptx"
        assert name == "demo.pptx"
        return "/api/v1/files/pdf-id/download", "pdf"

    monkeypatch.setattr(storage_module, "upload_file", _upload)
    monkeypatch.setattr(artifact_detector_module, "_maybe_convert_pptx", _convert)

    artifacts, _events = await cli_adapter_module._emit_cli_generated_file_artifacts(
        SimpleNamespace(_workspace_dir=str(tmp_path)),
        "00000000-0000-0000-0000-000000000001",
        "00000000-0000-0000-0000-000000000002",
        "",
        started_at=datetime.fromtimestamp(0, tz=timezone.utc),
    )

    assert len(uploads) == 1
    assert len(artifacts) == 2
    ppt_card, pdf_card = artifacts
    assert ppt_card["content"]["fileName"] == "demo.pptx"
    assert ppt_card["content"]["fileType"] == "pptx"
    assert ppt_card["content"]["fileUrl"] != pdf_card["content"]["fileUrl"]
    assert pdf_card["content"]["fileName"] == "demo.pdf"
    assert pdf_card["content"]["fileType"] == "pdf"
    assert pdf_card["content"]["fileUrl"] == "/api/v1/files/pdf-id/download"
    assert pdf_card["content"]["sourceFileName"] == "demo.pptx"


@pytest.mark.asyncio
async def test_generated_html_emits_preview_artifact(tmp_path, monkeypatch):
    from datetime import datetime, timezone
    from app.services import storage as storage_module

    html = tmp_path / "deck.html"
    html.write_text("<!doctype html><title>Preview</title>", encoding="utf-8")
    uploads: list[tuple[bytes, str, str]] = []

    def _upload(content, object_name, content_type):
        uploads.append((content, object_name, content_type))

    monkeypatch.setattr(storage_module, "upload_file", _upload)

    artifacts, events = await _emit_cli_generated_html_artifacts(
        SimpleNamespace(_workspace_dir=str(tmp_path)),
        "00000000-0000-0000-0000-000000000001",
        "00000000-0000-0000-0000-000000000002",
        started_at=datetime.fromtimestamp(0, tz=timezone.utc),
    )

    assert len(uploads) == 1
    assert len(artifacts) == 1
    assert len(events) == 1
    assert artifacts[0]["artifactType"] == "preview"
    assert artifacts[0]["content"]["fileName"] == "deck.html"
    assert "/preview/" in artifacts[0]["content"]["url"]


def test_sanitize_cli_deployment_links_replaces_backend_static_urls():
    content = "Open http://localhost:8080/index.html, or localhost:8080/xupt.html."
    artifact = {
        "artifactType": "deploy_status",
        "content": {"status": "deployed", "url": "http://localhost:8000"},
    }

    sanitized = _sanitize_cli_deployment_links(content, artifact)

    assert "http://localhost:8080/index.html" not in sanitized
    assert "localhost:8080/xupt.html" not in sanitized
    assert "http://localhost:8000/index.html" in sanitized
    assert "http://localhost:8000/xupt.html" in sanitized


def test_resolve_cli_workspace_isolates_agenthub_source_tree():
    workspace = _resolve_cli_workspace(_PROJECT_ROOT)

    assert workspace == _DEFAULT_ISOLATED_WORKSPACE


@pytest.mark.asyncio
async def test_cli_stream_persists_failed_fallback_for_empty_output(monkeypatch):
    from app.core import database as database_module
    from app.services import message as message_module
    from app.services.adapters import cli_adapter as cli_adapter_module

    captured: dict = {}

    class _FakeRunner:
        async def run_stream(self, **_kwargs):
            if False:
                yield None

    class _FakeSession:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def commit(self):
            return None

    async def _persist_stream_message(**kwargs):
        captured.update(kwargs)
        return SimpleNamespace(id=kwargs["message_id"])

    async def _no_file_artifacts(*_args, **_kwargs):
        return [], []

    monkeypatch.setattr(cli_adapter_module, "get_codex_runner", lambda: _FakeRunner())
    monkeypatch.setattr(cli_adapter_module, "_emit_cli_generated_file_artifacts", _no_file_artifacts)
    monkeypatch.setattr(database_module, "async_session_maker", lambda: _FakeSession())
    monkeypatch.setattr(message_module.MessageService, "persist_stream_message", _persist_stream_message)

    agent = SimpleNamespace(
        id="00000000-0000-0000-0000-000000000001",
        provider="codex-cli",
        name="Codex CLI",
    )
    events = [
        item
        async for item in CliAdapter().stream(
            agent=agent,
            conv_id="00000000-0000-0000-0000-000000000002",
            user_id="00000000-0000-0000-0000-000000000003",
            prompt="make a ppt",
        )
    ]

    assert captured["status"] == "failed"
    assert captured["content"] == _CLI_EMPTY_RESPONSE_MESSAGE
    assert any("event: error" in item for item in events)
    assert any('"finish_reason": "error"' in item for item in events)


def test_sanitize_cli_deployment_links_removes_backend_static_urls_when_deploy_failed():
    content = "Open http://localhost:8080/index.html after deployment."
    artifact = {
        "artifactType": "deploy_status",
        "content": {"status": "failed", "url": "", "error": "missing files"},
    }

    sanitized = _sanitize_cli_deployment_links(content, artifact)

    assert "localhost:8080" not in sanitized
    assert "本地部署链接生成失败" in sanitized
