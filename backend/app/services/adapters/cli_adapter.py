"""CLI adapter — runs local CLI tools (Claude Code, Codex) as agents.

CLI agents don't call remote LLM APIs. Instead they spawn local subprocesses
and stream the output as SSE events. In orchestration mode, a
before_model_callback intercepts the LLM call and redirects to the CLI.

Consolidates logic previously scattered across:
- conversations.py:_cli_sse_stream (streaming)
- coordinator_builder.py:_build_cli_sub_agent (orchestration)
- conversations.py: provider label / timeout / runner selection
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any, AsyncGenerator
from uuid import UUID, uuid4

from google.adk.agents import LlmAgent
from google.adk.models.llm_response import LlmResponse
from google.genai import types

from app.core.config import settings
from app.models.agent import Agent
from app.services.adapters.base import AgentAdapter, AdapterRegistry
from app.services.adk.cli_runner import (
    CliEvent,
    ClaudeCodeRunner,
    CodexCliRunner,
    get_claude_runner,
    get_codex_runner,
)

logger = logging.getLogger("agenthub.adapter.cli")

# Regex matching ADK template variables like {identifier}
import re
_ADK_TEMPLATE_RE = re.compile(r"\{([a-zA-Z_][a-zA-Z0-9_]*)\??\}")
_CLI_STATIC_URL_RE = re.compile(
    r"https?://[^\s\)\]>\"'`]+?\.(?:html|htm|css|js|mjs|ts|tsx|jsx|json|svg|txt|md)(?:[?#][^\s\)\]>\"'`]*)?",
    re.IGNORECASE,
)
_CLI_STATIC_PATH_RE = re.compile(
    r"(?<![\w:/.-])((?:[A-Za-z]:[\\/])?(?:[\w .@()+-]+[\\/])+[\w .@()+-]+\.(?:html|htm|css|js|mjs|ts|tsx|jsx|json|svg|txt|md)|[\w .@()+-]+\.(?:html|htm))(?![\w.-])",
    re.IGNORECASE,
)
_CLI_INLINE_CODE_RE = re.compile(r"`([^`\r\n]+)`")
_LOCAL_DEPLOY_REF_RE = re.compile(
    r"(?<![\w/])(?:https?://)?(?:localhost|127\.0\.0\.1)(?::\d+)(?:/[^\s`)\]>'\"]*)?",
    re.IGNORECASE,
)
_ENGLISH_PREAMBLE_RE = re.compile(
    r"^\s*(?:let me|i(?:'|’)ll|i will|i(?:'|’)m going to|i am going to|first,?\s+i(?:'|’)?ll|i(?:'|’)?ll start by)\b",
    re.IGNORECASE,
)


def _sanitize_for_adk(text: str) -> str:
    if not text:
        return text
    return _ADK_TEMPLATE_RE.sub(r"(\1)", text)


def _contains_cjk(text: str) -> bool:
    return any("\u4e00" <= ch <= "\u9fff" for ch in text or "")


def _strip_chinese_task_english_preamble(task_text: str, output_text: str) -> str:
    """Drop a generic English first-line preamble for Chinese orchestration tasks."""
    if not task_text or not output_text or not _contains_cjk(task_text):
        return output_text
    lines = output_text.splitlines()
    if not lines:
        return output_text
    first_line = lines[0].strip()
    if not first_line or not _ENGLISH_PREAMBLE_RE.match(first_line):
        return output_text
    for index, ch in enumerate(lines[0]):
        if "\u4e00" <= ch <= "\u9fff":
            return "\n".join([lines[0][index:], *lines[1:]]).lstrip()
    return "\n".join(lines[1:]).lstrip()


def _format_sse(event_name: str, data: dict) -> str:
    return f"event: {event_name}\ndata: {json.dumps(data)}\n\n"


_CLI_EMPTY_RESPONSE_MESSAGE = "Agent response was interrupted before producing output. Please retry."
_CLI_FAILED_WITHOUT_OUTPUT_MESSAGE = "Agent response failed before producing output. Please retry."

# Recognized document extensions that the CLI agent may have generated
_CLI_DOC_EXTENSIONS = {".pptx", ".ppt", ".pdf", ".docx", ".doc", ".xlsx", ".xls"}
_CLI_WEB_TEXT_EXTENSIONS = {
    ".html", ".htm", ".css", ".js", ".mjs", ".ts", ".tsx", ".jsx",
    ".json", ".svg", ".txt", ".md",
}
_CLI_HTML_EXTENSIONS = {".html", ".htm"}
_CLI_SCAN_SKIP_DIRS = {
    ".git", ".hg", ".svn", ".pytest_cache", ".mypy_cache", ".ruff_cache",
    ".venv", "venv", "env", "node_modules", "dist", "build", "__pycache__",
    ".next", ".vite", "coverage",
}
_DEPLOY_KEYWORDS = ("deploy", "deployment", "localhost", "部署", "发布到本地", "本地运行")

_DOC_EXT_TO_ARTIFACT_TYPE: dict[str, str] = {
    ".pptx": "pptx", ".ppt": "pptx",
    ".docx": "docx", ".doc": "docx",
    ".xlsx": "xlsx", ".xls": "xlsx",
    ".pdf": "pdf",
}
_DOC_EXT_TO_MIME_TYPE: dict[str, str] = {
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".ppt": "application/vnd.ms-powerpoint",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".doc": "application/msword",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".xls": "application/vnd.ms-excel",
    ".pdf": "application/pdf",
}


def _pdf_file_name(file_name: str) -> str:
    import os as _os

    stem = _os.path.splitext(file_name or "document")[0] or "document"
    return f"{stem}.pdf"


def _is_presentation_request(prompt: str) -> bool:
    text = (prompt or "").lower()
    return any(term in text for term in (
        "ppt",
        "pptx",
        "powerpoint",
        "presentation",
        "\u6f14\u793a\u6587\u7a3f",
        "\u5e7b\u706f\u7247",
    ))


def _iter_recent_workspace_files(
    workspace: str,
    extensions: set[str],
    cutoff: datetime,
):
    import os as _os

    for root, dirs, files in _os.walk(workspace):
        dirs[:] = [
            d for d in dirs
            if d not in _CLI_SCAN_SKIP_DIRS and not d.startswith(".")
        ]
        for name in files:
            if name.startswith(".") or name.startswith("~"):
                continue
            ext = _os.path.splitext(name)[1].lower()
            if ext not in extensions:
                continue
            path = _os.path.join(root, name)
            try:
                stat = _os.stat(path)
            except OSError:
                continue
            mtime = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc)
            if mtime < cutoff:
                continue
            yield path, stat, mtime


def _is_deployment_request(prompt: str, accumulated: str, artifacts: list[dict]) -> bool:
    text = (prompt or "").lower()
    explicit_terms = (
        "deploy",
        "deployment",
        "preview",
        "localhost",
        "local server",
        "\u90e8\u7f72",
        "\u9884\u89c8",
        "\u53d1\u5e03",
        "\u672c\u5730\u8fd0\u884c",
    )
    return any(term in text for term in explicit_terms)


def _filter_stray_deploy_status_artifacts(
    artifacts: list[dict],
    allow_deploy_status: bool,
) -> list[dict]:
    if allow_deploy_status:
        return artifacts
    return [
        artifact for artifact in artifacts
        if artifact.get("artifactType") != "deploy_status"
    ]


def _filter_local_file_artifacts(artifacts: list[dict]) -> list[dict]:
    filtered: list[dict] = []
    for artifact in artifacts:
        content = artifact.get("content") if isinstance(artifact, dict) else {}
        file_url = content.get("fileUrl") if isinstance(content, dict) else None
        if isinstance(file_url, str) and file_url.lower().startswith("file://"):
            continue
        filtered.append(artifact)
    return filtered


def _collect_deploy_files_from_artifacts(artifacts: list[dict]) -> dict[str, str]:
    files: dict[str, str] = {}
    for index, art in enumerate(artifacts, start=1):
        art_type = art.get("artifactType")
        content = art.get("content") if isinstance(art.get("content"), dict) else {}
        if art_type == "deploy_status":
            raw_files = content.get("files")
            if isinstance(raw_files, dict):
                for name, value in raw_files.items():
                    if isinstance(name, str) and isinstance(value, str):
                        files[name] = value
        if art_type == "preview":
            code = content.get("code") or content.get("html") or content.get("source")
            if isinstance(code, str) and code.strip():
                file_name = content.get("fileName") or content.get("filename") or "index.html"
                files[str(file_name)] = code
            continue
        if art_type != "code":
            continue
        code = content.get("code")
        if not isinstance(code, str) or not code.strip():
            continue
        file_name = content.get("fileName") or content.get("filename")
        language = str(content.get("language") or "").lower()
        if not isinstance(file_name, str) or not file_name.strip():
            ext = "html" if language in {"html", "xml"} else language or "txt"
            file_name = "index.html" if ext == "html" else f"code_{index}.{ext}"
        files[file_name] = code
    return files


def _extract_referenced_static_paths(content: str) -> list[str]:
    if not content:
        return []

    paths: list[str] = []
    seen: set[str] = set()

    def add(raw: str) -> None:
        value = (raw or "").strip().strip("`'\"<>[]()")
        value = value.rstrip(".,;:!?，。；：！？、")
        if not value:
            return
        key = value.lower()
        if key in seen:
            return
        seen.add(key)
        paths.append(value)

    for match in _CLI_INLINE_CODE_RE.finditer(content):
        inline = match.group(1)
        ext = _path_extension(inline)
        if ext in _CLI_WEB_TEXT_EXTENSIONS:
            add(inline)

    for match in _CLI_STATIC_URL_RE.finditer(content):
        add(match.group(0))

    for match in _CLI_STATIC_PATH_RE.finditer(content):
        add(match.group(1))

    return paths


def _path_extension(raw_path: str) -> str:
    import os as _os
    from urllib.parse import urlparse

    value = (raw_path or "").strip()
    if not value:
        return ""
    parsed = urlparse(value if "://" in value else f"file:///{value}")
    path = parsed.path if parsed.scheme in {"http", "https", "file"} else value
    return _os.path.splitext(path.split("?", 1)[0].split("#", 1)[0])[1].lower()


def _is_within_directory(parent: str, child: str) -> bool:
    import os as _os

    try:
        parent_abs = _os.path.normcase(_os.path.abspath(parent))
        child_abs = _os.path.normcase(_os.path.abspath(child))
        return _os.path.commonpath([parent_abs, child_abs]) == parent_abs
    except (OSError, ValueError):
        return False


def _resolve_referenced_static_path(workspace: str, raw_path: str) -> str | None:
    import os as _os
    from urllib.parse import unquote, urlparse

    value = (raw_path or "").strip().strip("`'\"<>[]()").rstrip(".,;:!?，。；：！？、")
    if not value:
        return None

    parsed = urlparse(value if "://" in value else f"file:///{value}")
    if parsed.scheme in {"http", "https"}:
        hostname = (parsed.hostname or "").lower()
        if hostname not in {"localhost", "127.0.0.1", "0.0.0.0"}:
            return None
        path_part = unquote(parsed.path or "").lstrip("/")
    else:
        path_part = value

    ext = _path_extension(path_part)
    if ext not in _CLI_WEB_TEXT_EXTENSIONS:
        return None

    normalized = path_part.replace("/", _os.sep).replace("\\", _os.sep)
    candidate = normalized if _os.path.isabs(normalized) else _os.path.join(workspace, normalized)
    candidate_abs = _os.path.abspath(candidate)
    if not _is_within_directory(workspace, candidate_abs):
        return None
    if not _os.path.isfile(candidate_abs):
        return None
    return candidate_abs


def _collect_static_deploy_files_from_paths(runner, raw_paths: list[str]) -> dict[str, str]:
    import os as _os

    workspace = getattr(runner, "_workspace_dir", None) or "."
    if not _os.path.isdir(workspace):
        return {}

    resolved_paths: list[str] = []
    seen_paths: set[str] = set()
    for raw_path in raw_paths:
        resolved = _resolve_referenced_static_path(workspace, raw_path)
        if not resolved:
            continue
        key = _os.path.normcase(_os.path.abspath(resolved))
        if key in seen_paths:
            continue
        seen_paths.add(key)
        resolved_paths.append(resolved)

    if not resolved_paths:
        return {}

    html_paths = [
        path for path in resolved_paths
        if _os.path.splitext(path)[1].lower() in _CLI_HTML_EXTENSIONS
    ]
    root_path = html_paths[0] if html_paths else resolved_paths[0]
    deploy_root = _os.path.dirname(root_path)
    if not _is_within_directory(workspace, deploy_root):
        return {}

    workspace_abs = _os.path.abspath(workspace)
    deploy_root_abs = _os.path.abspath(deploy_root)
    selected: list[tuple[str, object]] = []
    try:
        for root, dirs, names in _os.walk(deploy_root_abs):
            dirs[:] = [
                d for d in dirs
                if d not in _CLI_SCAN_SKIP_DIRS and not d.startswith(".")
            ]
            root_abs = _os.path.abspath(root)
            if deploy_root_abs == workspace_abs:
                dirs[:] = []
            for name in names:
                if name.startswith(".") or name.startswith("~"):
                    continue
                ext = _os.path.splitext(name)[1].lower()
                if ext not in _CLI_WEB_TEXT_EXTENSIONS:
                    continue
                path = _os.path.join(root_abs, name)
                try:
                    stat = _os.stat(path)
                except OSError:
                    continue
                selected.append((path, stat))
    except OSError:
        logger.exception("CLI deploy: referenced workspace scan failed")
        return {}

    files: dict[str, str] = {}
    first_html_content: str | None = None
    resolved_norm = {_os.path.normcase(_os.path.abspath(path)) for path in resolved_paths}

    for path, stat in sorted(selected, key=lambda item: item[0]):
        if getattr(stat, "st_size", 0) > 2 * 1024 * 1024:
            continue
        rel = _os.path.relpath(path, deploy_root_abs).replace("\\", "/")
        if rel.startswith("../") or rel == "..":
            continue
        try:
            with open(path, "r", encoding="utf-8", errors="replace") as f:
                content = f.read()
        except OSError:
            logger.exception("CLI deploy: cannot read %s", path)
            continue
        files[rel] = content
        ext = _os.path.splitext(path)[1].lower()
        if ext in _CLI_HTML_EXTENSIONS:
            path_key = _os.path.normcase(_os.path.abspath(path))
            if first_html_content is None or path_key in resolved_norm:
                first_html_content = content

    if "index.html" not in files and first_html_content is not None:
        files["index.html"] = first_html_content

    if files:
        logger.info(
            "CLI deploy: collected referenced static files root=%s files=%d",
            deploy_root_abs, len(files),
        )
    return files


def _collect_recent_static_deploy_files(
    runner,
    started_at: datetime,
) -> dict[str, str]:
    import os as _os

    workspace = getattr(runner, "_workspace_dir", None) or "."
    if not _os.path.isdir(workspace):
        return {}

    candidates = list(_iter_recent_workspace_files(workspace, _CLI_WEB_TEXT_EXTENSIONS, started_at))
    if not candidates:
        return {}

    html_candidates = [
        item for item in candidates
        if _os.path.splitext(item[0])[1].lower() in _CLI_HTML_EXTENSIONS
    ]
    root_path = max(html_candidates or candidates, key=lambda item: item[2])[0]
    deploy_root = _os.path.dirname(root_path)

    selected = []
    workspace_abs = _os.path.abspath(workspace)
    deploy_root_abs = _os.path.abspath(deploy_root)
    for path, stat, mtime in candidates:
        path_abs = _os.path.abspath(path)
        if deploy_root_abs == workspace_abs:
            if _os.path.dirname(path_abs) != workspace_abs:
                continue
        elif not (path_abs == deploy_root_abs or path_abs.startswith(deploy_root_abs + _os.sep)):
            continue
        selected.append((path, stat, mtime))

    files: dict[str, str] = {}
    newest_html: tuple[datetime, str] | None = None
    for path, stat, mtime in selected:
        if stat.st_size > 2 * 1024 * 1024:
            continue
        rel = _os.path.relpath(path, deploy_root).replace("\\", "/")
        if rel.startswith("../") or rel == "..":
            continue
        try:
            with open(path, "r", encoding="utf-8", errors="replace") as f:
                content = f.read()
        except OSError:
            logger.exception("CLI deploy: cannot read %s", path)
            continue
        files[rel] = content
        if _os.path.splitext(path)[1].lower() in _CLI_HTML_EXTENSIONS:
            if newest_html is None or mtime > newest_html[0]:
                newest_html = (mtime, content)

    if "index.html" not in files and newest_html is not None:
        files["index.html"] = newest_html[1]

    return files


async def _build_cli_deployment_artifact(
    runner,
    conv_id: UUID,
    user_id: UUID,
    message_id: str,
    prompt: str,
    accumulated: str,
    artifacts: list[dict],
    started_at: datetime,
) -> dict | None:
    if not _is_deployment_request(prompt, accumulated, artifacts):
        return None

    files = _collect_deploy_files_from_artifacts(artifacts)
    if not files:
        referenced_paths = _extract_referenced_static_paths(accumulated)
        files = _collect_static_deploy_files_from_paths(runner, referenced_paths)
    if not files:
        files = _collect_recent_static_deploy_files(runner, started_at)

    if not files:
        return {
            "artifactType": "deploy_status",
            "title": "本地部署",
            "content": {
                "status": "failed",
                "url": "",
                "error": "No deployable HTML/code files were produced by the CLI.",
            },
            "id": str(uuid4()),
        }

    try:
        from app.core.database import async_session_maker
        from app.services.deployment import DeploymentService

        async with async_session_maker() as db:
            deployment = await DeploymentService.create_deployment(
                db=db,
                conv_id=conv_id,
                user_id=user_id,
                name=f"cli-{message_id[:8]}",
                source_files=files,
            )
            await db.commit()

        url = f"http://localhost:{deployment.port}"
        logger.info(
            "CLI deployment created: conv=%s deployment=%s url=%s files=%d",
            conv_id, deployment.id, url, len(files),
        )
        return {
            "artifactType": "deploy_status",
            "title": "本地部署",
            "content": {
                "status": "deployed",
                "url": url,
                "port": deployment.port,
                "deploymentId": str(deployment.id),
                "files": files,
            },
            "id": str(uuid4()),
        }
    except Exception as exc:
        logger.exception("CLI deployment failed")
        return {
            "artifactType": "deploy_status",
            "title": "本地部署",
            "content": {
                "status": "building",
                "url": "DEPLOY_REQUEST",
                "files": files,
                "error": str(exc)[:500],
            },
            "id": str(uuid4()),
        }


def _sanitize_cli_deployment_links(content: str, deployment_artifact: dict | None) -> str:
    if not content or not deployment_artifact:
        return content

    artifact_content = deployment_artifact.get("content")
    if not isinstance(artifact_content, dict):
        return content
    deployment_url = artifact_content.get("url")
    has_deployed_url = (
        artifact_content.get("status") == "deployed"
        and isinstance(deployment_url, str)
        and deployment_url.startswith("http")
    )

    from urllib.parse import urlparse

    def replace(match: re.Match) -> str:
        original = match.group(0)
        raw = original.rstrip(".,;:!?，。；：！？")
        suffix = original[len(raw):]
        parsed_raw = raw if "://" in raw else f"http://{raw}"
        try:
            parsed = urlparse(parsed_raw)
        except ValueError:
            return original
        host = (parsed.hostname or "").lower()
        if host not in {"localhost", "127.0.0.1"}:
            return original
        if parsed.port != settings.PREVIEW_SERVER_PORT:
            return original
        path = parsed.path or ""
        ext = _path_extension(path)
        if path not in {"", "/"} and ext not in _CLI_HTML_EXTENSIONS:
            return original
        if path in {"", "/"}:
            replacement = deployment_url if has_deployed_url else "本地部署链接生成失败"
            return replacement + suffix
        return (
            deployment_url.rstrip("/") + path
            if has_deployed_url
            else "本地部署链接生成失败"
        ) + suffix

    return _LOCAL_DEPLOY_REF_RE.sub(replace, content)


async def _emit_cli_generated_file_artifacts(
    runner, conv_id: str, message_id: str, accumulated: str,
    started_at: datetime | None = None,
) -> tuple[list[dict], list[str]]:
    """Scan CLI workspace for generated document files, upload them to MinIO,
    convert PPTX→PDF where applicable, and return (artifacts, sse_events).
    Each SSE event string already includes the artifact payload for the frontend;
    the raw artifacts list is for DB persistence."""
    import os as _os
    from datetime import datetime as _dt, timezone as _tz, timedelta as _td
    from uuid import uuid4 as _uuid4

    workspace = getattr(runner, "_workspace_dir", None) or "."
    if not _os.path.isdir(workspace):
        return [], []

    from app.services.storage import upload_file as _minio_upload
    from app.services.artifact_detector import _maybe_convert_pptx

    # Look for files with recognised extensions; skip hidden / temp files
    cutoff = started_at or (_dt.now(_tz.utc) - _td(minutes=10))
    artifacts: list[dict] = []
    sse_events: list[str] = []

    try:
        for path, stat, _mtime in _iter_recent_workspace_files(workspace, _CLI_DOC_EXTENSIONS, cutoff):
            name = _os.path.basename(path)
            ext = _os.path.splitext(name)[1].lower()

            file_type = _DOC_EXT_TO_ARTIFACT_TYPE.get(ext, "pdf")
            file_id = str(_uuid4())

            try:
                with open(path, "rb") as f:
                    file_bytes = f.read()
            except OSError:
                logger.exception("CLI artifact: cannot read %s", path)
                continue

            original_mime_type = _DOC_EXT_TO_MIME_TYPE.get(ext, "application/octet-stream")
            _minio_upload(file_bytes, f"files/{file_id}", original_mime_type)
            doc_url = f"/api/v1/files/{file_id}/download"

            final_url, final_type = await _maybe_convert_pptx(doc_url, file_type, name)

            content = {
                "fileName": name,
                "fileUrl": doc_url,
                "fileType": file_type,
                "fileSize": len(file_bytes),
            }

            artifact = {
                "artifactType": "document",
                "title": name,
                "content": content,
                "id": str(_uuid4()),
            }
            artifacts.append(artifact)
            sse_events.append(_format_sse("artifact", {
                "version": "v1",
                "event_id": str(_uuid4()),
                "conversation_id": conv_id,
                "message_id": message_id,
                "artifact": artifact,
                "timestamp": _dt.now(_tz.utc).isoformat(),
            }))
            if final_type != file_type:
                pdf_name = _pdf_file_name(name)
                pdf_artifact = {
                    "artifactType": "document",
                    "title": pdf_name,
                    "content": {
                        "fileName": pdf_name,
                        "fileUrl": final_url,
                        "fileType": final_type,
                        "fileSize": 0,
                        "sourceFileName": name,
                        "sourceFileType": file_type,
                    },
                    "id": str(_uuid4()),
                }
                artifacts.append(pdf_artifact)
                sse_events.append(_format_sse("artifact", {
                    "version": "v1",
                    "event_id": str(_uuid4()),
                    "conversation_id": conv_id,
                    "message_id": message_id,
                    "artifact": pdf_artifact,
                    "timestamp": _dt.now(_tz.utc).isoformat(),
                }))
            logger.info(
                "CLI artifact: %s → fileType=%s fileUrl=%s",
                name, file_type, doc_url,
            )
    except OSError:
        logger.exception("CLI artifact: workspace scan failed")

    return artifacts, sse_events


async def _emit_cli_generated_html_artifacts(
    runner, conv_id: str, message_id: str,
    started_at: datetime | None = None,
) -> tuple[list[dict], list[str]]:
    import os as _os
    from datetime import datetime as _dt, timezone as _tz, timedelta as _td
    from uuid import uuid4 as _uuid4

    workspace = getattr(runner, "_workspace_dir", None) or "."
    if not _os.path.isdir(workspace):
        return [], []

    from app.core.config import settings
    from app.services.storage import upload_file as _minio_upload

    cutoff = started_at or (_dt.now(_tz.utc) - _td(minutes=10))
    candidates = list(_iter_recent_workspace_files(workspace, _CLI_HTML_EXTENSIONS, cutoff))
    if not candidates:
        return [], []

    path, stat, _mtime = max(candidates, key=lambda item: item[2])
    if getattr(stat, "st_size", 0) > 2 * 1024 * 1024:
        return [], []

    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            html = f.read()
    except OSError:
        logger.exception("CLI artifact: cannot read HTML preview %s", path)
        return [], []

    preview_id = str(_uuid4())
    _minio_upload(html.encode("utf-8"), f"previews/{preview_id}.html", "text/html")
    name = _os.path.basename(path)
    artifact = {
        "artifactType": "preview",
        "title": name,
        "content": {
            "url": f"{settings.PREVIEW_SERVER_URL}/preview/{preview_id}",
            "title": name,
            "previewType": "web",
            "fileName": name,
        },
        "id": str(_uuid4()),
    }
    event = _format_sse("artifact", {
        "version": "v1",
        "event_id": str(_uuid4()),
        "conversation_id": conv_id,
        "message_id": message_id,
        "artifact": artifact,
        "timestamp": _dt.now(_tz.utc).isoformat(),
    })
    logger.info("CLI artifact: %s -> preview %s", name, artifact["content"]["url"])
    return [artifact], [event]


class CliAdapter(AgentAdapter):
    """Adapter for CLI-based coding agents (Claude Code, Codex)."""

    def resolve_model(self, agent: Agent) -> Any:
        # CLI agents don't use a remote model — the CLI manages its own.
        return None

    def is_cli(self) -> bool:
        return True

    # ------------------------------------------------------------------
    # Single-chat streaming (overrides base class)
    # ------------------------------------------------------------------

    async def stream(
        self,
        agent: Agent,
        conv_id: UUID,
        user_id: UUID,
        prompt: str,
    ) -> AsyncGenerator[str, None]:
        """Stream CLI output as SSE events.

        Formerly _cli_sse_stream() in conversations.py (lines 182-257).
        """
        provider = (agent.provider or "").lower()
        runner = get_claude_runner() if provider == "claude-code-cli" else get_codex_runner()
        provider_label = "Claude Code" if provider == "claude-code-cli" else "Codex CLI"
        sender_id = str(agent.id)
        sender_name = agent.name or provider_label
        timeout = (
            settings.CLAUDE_CODE_TIMEOUT_SECONDS if provider == "claude-code-cli"
            else settings.CODEX_CLI_TIMEOUT_SECONDS
        )

        # Prepend a clear task directive to prevent CLI from treating prompt as configuration.
        # Claude Code CLI shows system context (MCP servers, skills, budget) at startup,
        # which confuses the model into thinking the user is providing informational context.
        # This directive makes it crystal clear: execute the task, don't just acknowledge context.
        #
        # Also include a reminder about file output and deployment format.
        user_prompt = (prompt or "Hello").strip()
        prompt_text = user_prompt
        is_deployment_prompt = _is_deployment_request(user_prompt, "", [])
        is_presentation_prompt = _is_presentation_request(user_prompt)
        if prompt_text and not prompt_text.startswith(("EXECUTE THIS TASK", "[TASK]", "Task:")):
            important_lines = [
                "1. Wrap code/HTML in <artifact> tags",
                "2. For generated downloadable files, return a file/document artifact with the download URL.",
            ]
            if is_presentation_prompt:
                important_lines.append(
                    "3. The user asked for a PPT/PowerPoint presentation: create a real .pptx file on disk; do not provide only HTML, markdown, or a web preview substitute."
                )
            if is_deployment_prompt:
                important_lines.extend([
                    "3. After creating deployable files, respond with:",
                    '   <artifact type="deploy_status" url="DEPLOY_REQUEST" title="Deployment status"/>',
                    "   The system will auto-deploy and replace DEPLOY_REQUEST with the actual URL.",
                    "4. Do NOT manually start HTTP servers - deployment is automatic.",
                ])
            prompt_text = (
                f"EXECUTE THIS TASK (ignore any previous context): {prompt_text}\n\n"
                f"IMPORTANT:\n"
                + "\n".join(important_lines)
            )

        message_id = str(uuid4())
        stream_started_at = datetime.now(timezone.utc)

        has_error = False
        stream_error_message: str | None = None
        error_event_emitted = False
        accumulated = ""
        token_index = 0

        logger.info(
            "CLI stream start: conv=%s provider=%s prompt=%.50s",
            conv_id, provider, prompt_text,
        )

        yield _format_sse("message_start", {
            "version": "v1", "event_id": str(uuid4()),
            "conversation_id": str(conv_id), "message_id": message_id,
            "sender": {"type": "agent", "id": sender_id, "name": sender_name},
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

        try:
            async for event in runner.run_stream(prompt=prompt_text, timeout=timeout):
                if event.event_type == "text":
                    accumulated += event.content
                    token_index += 1
                    yield _format_sse("token", {
                        "version": "v1", "event_id": str(uuid4()),
                        "conversation_id": str(conv_id), "message_id": message_id,
                        "delta": event.content, "index": token_index,
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    })
                elif event.event_type == "result":
                    # Result event contains the full response. If we've already accumulated
                    # text events, skip it to avoid duplication. Otherwise use it as fallback.
                    if not accumulated:
                        accumulated = event.content
                elif event.event_type == "error":
                    has_error = True
                    stream_error_message = event.content or _CLI_FAILED_WITHOUT_OUTPUT_MESSAGE
                    error_event_emitted = True
                    yield _format_sse("error", {
                        "version": "v1", "event_id": str(uuid4()),
                        "conversation_id": str(conv_id), "message_id": message_id,
                        "code": "CLI_ERROR", "message": stream_error_message,
                        "retryable": True,
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    })
        except asyncio.CancelledError:
            has_error = True
            stream_error_message = _CLI_EMPTY_RESPONSE_MESSAGE
            if not accumulated.strip():
                accumulated = _CLI_EMPTY_RESPONSE_MESSAGE
            logger.warning("CLI stream cancelled for conv=%s message=%s", conv_id, message_id)
        except Exception as e:
            has_error = True
            stream_error_message = str(e) or _CLI_FAILED_WITHOUT_OUTPUT_MESSAGE
            error_event_emitted = True
            logger.exception("CLI stream failed for conv=%s", conv_id)
            yield _format_sse("error", {
                "version": "v1", "event_id": str(uuid4()),
                "conversation_id": str(conv_id), "message_id": message_id,
                "code": "CLI_EXECUTION_ERROR", "message": stream_error_message,
                "retryable": True,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })

        # Detect XML artifacts embedded in the accumulated content (e.g.
        # <artifact type="code">...</artifact>). This mirrors what
        # _accumulate_stream_events does for ADK streams. Without this step
        # the frontend stripArtifactTags() removes the XML markup but no
        # artifact cards are rendered — the user only sees the plain-text
        # prefix before the first <artifact> tag.
        xml_artifacts: list[dict] = []
        if accumulated:
            try:
                from app.services.artifact_detector import detect_artifacts
                xml_artifacts = await detect_artifacts(accumulated)
                logger.info(
                    "CLI artifact detection: conv=%s found=%d artifacts",
                    conv_id, len(xml_artifacts),
                )
            except Exception:
                logger.exception("CLI artifact detection failed")

        artifacts_to_emit = _filter_stray_deploy_status_artifacts(
            _filter_local_file_artifacts(list(xml_artifacts)),
            allow_deploy_status=is_deployment_prompt,
        )

        # After CLI finishes, scan workspace for generated files (e.g. PPTX)
        # and upload them to MinIO so the artifact detection pipeline can
        # produce DocumentCard / PDF preview cards.
        if not has_error:
            try:
                cli_artifacts, _cli_art_sse = await _emit_cli_generated_file_artifacts(
                    runner, str(conv_id), message_id, accumulated,
                    started_at=stream_started_at,
                )
                artifacts_to_emit.extend(cli_artifacts)
                artifacts_to_emit = _filter_local_file_artifacts(artifacts_to_emit)
                artifacts_to_emit = _filter_stray_deploy_status_artifacts(
                    artifacts_to_emit,
                    allow_deploy_status=is_deployment_prompt,
                )
            except Exception:
                logger.exception("CLI file artifact scan failed")
            if not any(art.get("artifactType") == "document" for art in artifacts_to_emit):
                try:
                    html_artifacts, _html_art_sse = await _emit_cli_generated_html_artifacts(
                        runner, str(conv_id), message_id,
                        started_at=stream_started_at,
                    )
                    artifacts_to_emit.extend(html_artifacts)
                except Exception:
                    logger.exception("CLI HTML artifact scan failed")

        if not has_error:
            deployment_artifact = await _build_cli_deployment_artifact(
                runner=runner,
                conv_id=conv_id,
                user_id=user_id,
                message_id=message_id,
                prompt=user_prompt,
                accumulated=accumulated,
                artifacts=artifacts_to_emit,
                started_at=stream_started_at,
            )
            if deployment_artifact:
                artifacts_to_emit = [
                    art for art in artifacts_to_emit
                    if art.get("artifactType") != "deploy_status"
                ]
                artifacts_to_emit.append(deployment_artifact)

        # Persist after deployment generation so misleading CLI-provided
        # backend links can be replaced with the real deployment URL.
        try:
            from app.core.database import async_session_maker
            from app.services.message import MessageService
            from app.services.artifact_detector import strip_artifact_tags
            deployment_artifact = next(
                (art for art in artifacts_to_emit if art.get("artifactType") == "deploy_status"),
                None,
            )
            clean_content = strip_artifact_tags(accumulated)
            clean_content = _sanitize_cli_deployment_links(clean_content, deployment_artifact)
            if not clean_content.strip() and not artifacts_to_emit:
                has_error = True
                stream_error_message = stream_error_message or _CLI_EMPTY_RESPONSE_MESSAGE
                clean_content = stream_error_message
                if not accumulated.strip():
                    accumulated = clean_content
                logger.warning(
                    "CLI stream produced no visible output; persisting failed fallback "
                    "conv=%s message=%s",
                    conv_id,
                    message_id,
                )
            if has_error and not error_event_emitted:
                error_event_emitted = True
                yield _format_sse("error", {
                    "version": "v1", "event_id": str(uuid4()),
                    "conversation_id": str(conv_id), "message_id": message_id,
                    "code": "CLI_EMPTY_RESPONSE",
                    "message": stream_error_message or _CLI_FAILED_WITHOUT_OUTPUT_MESSAGE,
                    "retryable": True,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                })
            async with async_session_maker() as db:
                await MessageService.persist_stream_message(
                    db=db, conv_id=conv_id, message_id=message_id,
                    sender_name=sender_name,
                    sender_id=sender_id,
                    content=clean_content,
                    status="failed" if has_error else "done",
                )
                await db.commit()
        except Exception:
            logger.exception("Persist CLI stream message failed")

        for art in artifacts_to_emit:
            art_event_id = str(uuid4())
            yield _format_sse("artifact", {
                "version": "v1", "event_id": art_event_id,
                "conversation_id": str(conv_id), "message_id": message_id,
                "artifact": art,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
            try:
                from app.core.database import async_session_maker
                from app.services.artifact import ArtifactService
                async with async_session_maker() as db:
                    await ArtifactService.append_version(
                        db=db,
                        conversation_id=conv_id,
                        message_id=UUID(message_id),
                        artifact_payload=art,
                        event_id=art_event_id,
                    )
                    await db.commit()
            except Exception:
                logger.exception("CLI artifact persist failed")

        yield _format_sse("message_end", {
            "version": "v1", "event_id": str(uuid4()),
            "conversation_id": str(conv_id), "message_id": message_id,
            "finish_reason": "error" if has_error else "completed",
            "usage": {"input_tokens": 0, "output_tokens": len(accumulated)},
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

    # ------------------------------------------------------------------
    # Orchestration sub-agent (overrides base class)
    # ------------------------------------------------------------------

    def build_agent(
        self,
        agent: Agent,
        tool_loader=None,
    ) -> LlmAgent:
        """Build a sub-agent for orchestration mode.

        Uses before_model_callback to intercept the LLM call and run the
        CLI process instead. The coordinator dispatches to this agent via
        request_task_<name> just like any other sub-agent.

        Formerly _build_cli_sub_agent() in coordinator_builder.py (lines 110-187).

        Note: The instruction field is initially set to system_prompt here,
        but workflow_builder.py will override it with the merged subtask
        instruction after calling this method.
        """
        provider = (agent.provider or "").lower()

        # Create a mutable container to hold the LlmAgent reference so the
        # callback can access the merged instruction set by workflow_builder.
        llm_agent_ref = {"instance": None}

        async def cli_before_model_callback(
            callback_context, llm_request
        ) -> LlmResponse | None:
            from app.services.adk.cli_runner import claude_code_tool, codex_cli_tool

            # In Workflow mode, the LlmAgent's instruction has been merged by
            # workflow_builder.py (line 65): llm_agent.instruction = _merge_instruction(...)
            # This merged instruction contains:
            #   ARTIFACT_FORMAT_SPEC + system_prompt + EXECUTOR_SCOPE_DIRECTIVE + "Your specific task: <task>"
            #
            # We need to extract ONLY the task portion for CLI execution.
            # Do NOT extract from llm_request.contents — that may contain skills lists
            # and other ADK metadata that pollutes the prompt.

            # Access the LlmAgent instance (not the ORM Agent) from the mutable ref
            llm_agent_instance = llm_agent_ref.get("instance")
            if llm_agent_instance and hasattr(llm_agent_instance, 'instruction'):
                raw_instruction = llm_agent_instance.instruction
            else:
                # Fallback: use system_prompt if LlmAgent wasn't set
                from app.services.artifact_format import build_instruction
                raw_instruction = build_instruction(agent)

            # Extract just the task after "Your specific task:"
            task_marker = "Your specific task:"
            task_pos = raw_instruction.find(task_marker)
            if task_pos >= 0:
                # Take everything after the task marker — this already contains
                # the language directive from Planner rule #7
                task_text = raw_instruction[task_pos + len(task_marker):].strip()
            else:
                # If no marker found, the whole instruction is the task
                # (single-chat mode, not workflow)
                task_text = raw_instruction.strip()

            # Pass the task directly to CLI without adding extra English instructions
            # The task_text already contains language directives from the Planner
            full_prompt = task_text

            # Run the appropriate CLI (non-streaming for orchestration).
            # Use the configured timeout from settings; CLI agents doing
            # file creation may need generous headroom.
            timeout = (
                settings.CLAUDE_CODE_TIMEOUT_SECONDS if provider == "claude-code-cli"
                else settings.CODEX_CLI_TIMEOUT_SECONDS
            )
            base_tool = claude_code_tool if provider == "claude-code-cli" else codex_cli_tool
            result = await base_tool(prompt=full_prompt, timeout=timeout)

            if result.get("success"):
                output_text = _strip_chinese_task_english_preamble(
                    full_prompt,
                    result.get("result", ""),
                )
                return LlmResponse(
                    content=types.Content(
                        role="model",
                        parts=[types.Part.from_text(text=output_text)],
                    ),
                )
            else:
                return LlmResponse(
                    content=types.Content(
                        role="model",
                        parts=[types.Part.from_text(
                            text=f"Error: {result.get('error', 'CLI execution failed')}"
                        )],
                    ),
                )

        # Build description with capability tags for Coordinator matching
        capabilities = agent.capabilities or []
        cap_tags = (
            ", ".join(capabilities) if isinstance(capabilities, list)
            else str(capabilities)
        )
        description = (
            agent.system_prompt.strip()[:200] if agent.system_prompt
            else f"{agent.name} - local CLI coding agent"
        )
        if cap_tags:
            description = f"[{cap_tags}] {description}"

        # Build the LlmAgent
        llm_agent = LlmAgent(
            name=agent.name.replace(" ", "_").replace("-", "_"),
            description=description,
            instruction=agent.system_prompt or "You are a helpful coding agent.",
            before_model_callback=cli_before_model_callback,
            mode="single_turn",  # Changed from "task" to allow CLI agents in Workflow graphs
        )

        # Store the LlmAgent reference so the callback can access it after
        # workflow_builder.py sets the merged instruction
        llm_agent_ref["instance"] = llm_agent

        return llm_agent


# Register CLI providers.
AdapterRegistry.register("claude-code-cli", CliAdapter())
AdapterRegistry.register("codex-cli", CliAdapter())
