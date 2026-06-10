"""Resolve deployable source files from conversation artifacts."""

from __future__ import annotations

from pathlib import PurePosixPath
from typing import Iterable
from urllib.parse import urlparse

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.artifact import Artifact
from app.services import storage


_LANGUAGE_EXTENSIONS = {
    "bash": ".sh",
    "css": ".css",
    "go": ".go",
    "html": ".html",
    "javascript": ".js",
    "js": ".js",
    "json": ".json",
    "jsx": ".jsx",
    "markdown": ".md",
    "python": ".py",
    "rust": ".rs",
    "sql": ".sql",
    "text": ".txt",
    "tsx": ".tsx",
    "typescript": ".ts",
    "yaml": ".yaml",
    "yml": ".yml",
}


class DeploymentSourceResolver:
    """Collect and normalize files that can be deployed from a conversation."""

    @staticmethod
    async def resolve_from_conversation(
        db: AsyncSession,
        conversation_id,
        explicit_files: dict[str, str] | None = None,
    ) -> tuple[dict[str, str], dict]:
        if explicit_files:
            files = DeploymentSourceResolver.normalize_files(explicit_files)
            files = DeploymentSourceResolver.ensure_index_file(files)
            return files, DeploymentSourceResolver.build_summary(files, source="request")

        result = await db.execute(
            select(Artifact)
            .where(Artifact.conversation_id == conversation_id)
            .order_by(Artifact.created_at.asc(), Artifact.version.asc())
        )
        artifacts = list(result.scalars().all())

        latest_by_chain: dict[tuple, Artifact] = {}
        for artifact in artifacts:
            content = artifact.content if isinstance(artifact.content, dict) else {}
            chain_key = (
                artifact.message_id,
                content.get("_mergeKey") or str(artifact.id),
            )
            current = latest_by_chain.get(chain_key)
            if current is None or (artifact.version or 0) >= (current.version or 0):
                latest_by_chain[chain_key] = artifact

        files: dict[str, str] = {}
        generated_index = 1
        for artifact in latest_by_chain.values():
            if artifact.artifact_type == "preview":
                preview_files = DeploymentSourceResolver.extract_preview_files(artifact)
                for raw_name, code in preview_files.items():
                    file_name = DeploymentSourceResolver.unique_file_name(files, raw_name)
                    files[file_name] = code
                continue

            if artifact.artifact_type != "code":
                continue
            content = artifact.content if isinstance(artifact.content, dict) else {}
            code = content.get("code")
            if not isinstance(code, str) or not code.strip():
                continue

            language = str(content.get("language") or "text").lower()
            raw_name = content.get("fileName") or content.get("file_name") or artifact.title
            if not isinstance(raw_name, str) or not raw_name.strip():
                raw_name = DeploymentSourceResolver.derive_file_name(language, generated_index)
                generated_index += 1

            file_name = DeploymentSourceResolver.normalize_path(raw_name)
            file_name = DeploymentSourceResolver.unique_file_name(files, file_name)
            files[file_name] = code

        files = DeploymentSourceResolver.ensure_index_file(files)
        return files, DeploymentSourceResolver.build_summary(files, source="artifacts")

    @staticmethod
    def normalize_files(files: dict[str, str]) -> dict[str, str]:
        normalized: dict[str, str] = {}
        for name, content in files.items():
            if not isinstance(content, str):
                continue
            path = DeploymentSourceResolver.normalize_path(str(name))
            normalized[path] = content
        return normalized

    @staticmethod
    def normalize_path(path: str) -> str:
        value = (path or "").replace("\\", "/").strip().lstrip("/")
        value = value or "index.html"
        pure = PurePosixPath(value)
        if pure.is_absolute() or any(part in {"", ".", ".."} for part in pure.parts):
            raise ValueError(f"Invalid deployment file path: {path}")
        return str(pure)

    @staticmethod
    def derive_file_name(language: str, index: int) -> str:
        suffix = _LANGUAGE_EXTENSIONS.get((language or "text").lower(), f".{language}" if language else ".txt")
        return f"code_{index}{suffix}"

    @staticmethod
    def unique_file_name(existing: dict[str, str], file_name: str) -> str:
        if file_name not in existing:
            return file_name
        path = PurePosixPath(file_name)
        parent = "" if str(path.parent) == "." else f"{path.parent}/"
        stem = path.stem or "file"
        suffix = path.suffix
        counter = 2
        candidate = f"{parent}{stem}_{counter}{suffix}"
        while candidate in existing:
            counter += 1
            candidate = f"{parent}{stem}_{counter}{suffix}"
        return candidate

    @staticmethod
    def extract_preview_files(artifact: Artifact) -> dict[str, str]:
        content = artifact.content if isinstance(artifact.content, dict) else {}
        code = content.get("code") or content.get("html") or content.get("source")
        file_name = (
            content.get("fileName")
            or content.get("file_name")
            or content.get("filename")
            or "index.html"
        )
        if isinstance(code, str) and code.strip():
            return {DeploymentSourceResolver.normalize_path(str(file_name)): code}

        url = content.get("url") or content.get("previewUrl") or content.get("preview_url")
        html = DeploymentSourceResolver.load_preview_html_from_url(url)
        if html:
            return {"index.html": html}
        return {}

    @staticmethod
    def load_preview_html_from_url(url: object) -> str | None:
        if not isinstance(url, str) or not url.strip():
            return None
        try:
            parsed = urlparse(url)
            path = parsed.path
            marker = "/preview/"
            if marker not in path:
                return None
            preview_id = path.rsplit(marker, 1)[1].strip("/").split("/", 1)[0]
            if not preview_id:
                return None
            return storage.get_file(f"previews/{preview_id}.html").decode("utf-8")
        except Exception:
            return None

    @staticmethod
    def ensure_index_file(files: dict[str, str]) -> dict[str, str]:
        if not files:
            return {}
        if "index.html" in files:
            return files

        html_files = [name for name in files if name.lower().endswith((".html", ".htm"))]
        if len(html_files) == 1:
            files = dict(files)
            files["index.html"] = files[html_files[0]]
            return files

        files = dict(files)
        files["index.html"] = DeploymentSourceResolver._build_file_listing(files.keys())
        return files

    @staticmethod
    def _build_file_listing(paths: Iterable[str]) -> str:
        items = "\n".join(
            f'<li><a href="{path}">{path}</a></li>'
            for path in sorted(paths)
            if path != "index.html"
        )
        return (
            "<!doctype html>\n"
            '<html lang="en">\n'
            "<head><meta charset=\"utf-8\"><title>AgentHub Preview</title></head>\n"
            "<body>\n"
            "<h1>AgentHub Preview</h1>\n"
            "<p>No index.html was found. Select a generated file:</p>\n"
            f"<ul>{items}</ul>\n"
            "</body>\n"
            "</html>\n"
        )

    @staticmethod
    def build_summary(files: dict[str, str], source: str) -> dict:
        total_bytes = sum(len(content.encode("utf-8")) for content in files.values())
        entry = "index.html" if "index.html" in files else next(iter(files), None)
        return {
            "source": source,
            "fileCount": len(files),
            "totalBytes": total_bytes,
            "entryFile": entry,
            "files": sorted(files.keys()),
        }
