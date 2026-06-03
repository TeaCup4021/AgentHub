import re
import json
import hashlib
import logging
from uuid import uuid4
from typing import List, Dict

logger = logging.getLogger("agenthub.artifact_detector")

_CODE_BLOCK_RE = re.compile(
    r"```(\w+)?\s*\n(.*?)```", re.DOTALL
)

_INLINE_CODE_RE = re.compile(r"`[^`\n]+`")

_URL_RE = re.compile(
    r"https?://[^\s\)\]>]+"
)

_CREATE_FILE_JSON_RE = re.compile(
    r'"status"\s*:\s*"created".*?"download_url"\s*:\s*"([^"]+)".*?"file_name"\s*:\s*"([^"]+)".*?"file_size"\s*:\s*(\d+).*?"mime_type"\s*:\s*"([^"]+)"'
)

_PREVIEW_PUBLISH_JSON_RE = re.compile(
    r'"status"\s*:\s*"published".*?"preview_id"\s*:\s*"([^"]+)".*?"preview_url"\s*:\s*"([^"]+)"'
)

_PREVIEW_TITLE_RE = re.compile(r'"title"\s*:\s*"([^"]*)"')


def build_content_hash(content: Dict) -> str:
    raw = json.dumps(content, sort_keys=True, ensure_ascii=False)
    return hashlib.md5(raw.encode()).hexdigest()[:12]


def detect_artifacts(content: str) -> List[Dict]:
    artifacts: List[Dict] = []

    artifacts.extend(_detect_code_blocks(content))
    artifacts.extend(_detect_diffs(content))
    artifacts.extend(_detect_urls(content))
    artifacts.extend(_detect_file_artifacts(content))
    artifacts.extend(_detect_preview_artifacts(content))

    for art in artifacts:
        if "id" not in art:
            art["id"] = str(uuid4())

    return artifacts


def _detect_code_blocks(content: str) -> List[Dict]:
    results = []
    for idx, match in enumerate(_CODE_BLOCK_RE.finditer(content)):
        language = (match.group(1) or "").strip()
        if language == "diff":
            continue
        code = match.group(2)
        results.append({
            "artifactType": "code",
            "title": _derive_code_title(language, idx),
            "content": {
                "language": language or "text",
                "code": code.strip(),
                "fileName": _derive_file_name(language, idx),
            },
        })
    return results


def _detect_diffs(content: str) -> List[Dict]:
    results = []
    for idx, match in enumerate(_CODE_BLOCK_RE.finditer(content)):
        language = (match.group(1) or "").strip()
        if language != "diff":
            continue
        diff_text = match.group(2)
        old_code, new_code = _split_diff(diff_text)
        results.append({
            "artifactType": "diff",
            "title": f"变更对比 #{idx + 1}",
            "content": {
                "language": "diff",
                "oldCode": old_code,
                "newCode": new_code,
                "fileName": "",
            },
        })
    return results


_SYSTEM_URL_PATTERNS = ["/preview/", "/files/"]


def _is_system_url(url: str) -> bool:
    return any(p in url for p in _SYSTEM_URL_PATTERNS)


_EMBEDDABLE_DOMAINS = [
    "docs.google.com", "office.com", "notion.so",
    "figma.com", "youtube.com", "youtu.be", "vimeo.com",
]


def _is_embeddable(url: str) -> bool:
    url_lower = url.lower()
    if any(d in url_lower for d in _EMBEDDABLE_DOMAINS):
        return True
    if any(url_lower.endswith(ext) for ext in [".pdf", ".doc", ".xls", ".ppt"]):
        return True
    return False


def _detect_urls(content: str) -> List[Dict]:
    cleaned = _INLINE_CODE_RE.sub(" ", content)
    cleaned = _CODE_BLOCK_RE.sub("", cleaned)
    seen = set()
    results = []
    for idx, match in enumerate(_URL_RE.finditer(cleaned)):
        url = match.group(0).rstrip(".,;:!?\"'`)]*_")
        if url in seen:
            continue
        seen.add(url)

        if _is_system_url(url):
            continue

        if _is_embeddable(url):
            preview_type = "doc" if any(
                d in url.lower() for d in ["docs.google.com", "office.com", "notion.so", "figma.com", ".pdf", ".doc", ".xls", ".ppt"]
            ) else "web"
            results.append({
                "artifactType": "preview",
                "title": _preview_title(url, idx),
                "content": {
                    "url": url,
                    "title": url,
                    "previewType": preview_type,
                },
            })
        else:
            og_data = _try_fetch_og(url)
            results.append({
                "artifactType": "link_preview",
                "title": og_data.get("title") or _preview_title(url, idx),
                "content": {
                    "url": url,
                    "title": og_data.get("title"),
                    "description": og_data.get("description"),
                    "image": og_data.get("image"),
                    "favicon": og_data.get("favicon"),
                    "siteName": og_data.get("site_name"),
                },
            })
    return results


def _detect_file_artifacts(content: str) -> List[Dict]:
    results = []
    seen = set()
    for match in _CREATE_FILE_JSON_RE.finditer(content):
        download_url = match.group(1)
        file_name = match.group(2)
        file_size = int(match.group(3))
        mime_type = match.group(4)
        key = f"{file_name}:{file_size}"
        if key in seen:
            continue
        seen.add(key)
        results.append({
            "artifactType": "file",
            "title": file_name,
            "content": {
                "fileName": file_name,
                "fileUrl": download_url,
                "fileType": mime_type,
                "fileSize": file_size,
            },
        })
    return results


def _detect_preview_artifacts(content: str) -> List[Dict]:
    results = []
    seen = set()
    for match in _PREVIEW_PUBLISH_JSON_RE.finditer(content):
        preview_id = match.group(1)
        preview_url = match.group(2)
        if preview_id in seen:
            continue
        seen.add(preview_id)
        title_match = _PREVIEW_TITLE_RE.search(match.group(0))
        title = title_match.group(1) if title_match else "预览页面"
        results.append({
            "artifactType": "preview",
            "title": title,
            "content": {
                "url": preview_url,
                "title": title,
                "previewType": "web",
            },
        })
    return results


def _split_diff(diff_text: str) -> tuple[str, str]:
    old_lines: List[str] = []
    new_lines: List[str] = []
    for line in diff_text.split("\n"):
        if line.startswith("---") or line.startswith("+++"):
            continue
        if line.startswith("@@"):
            continue
        if line.startswith("-"):
            old_lines.append(line[1:])
        elif line.startswith("+"):
            new_lines.append(line[1:])
        elif line.startswith(" "):
            text = line[1:]
            old_lines.append(text)
            new_lines.append(text)
        elif line.strip():
            old_lines.append(line)
            new_lines.append(line)
    return "\n".join(old_lines), "\n".join(new_lines)


def _derive_code_title(language: str, idx: int) -> str:
    if language:
        return f"{language} 代码 #{idx + 1}"
    return f"代码 #{idx + 1}"


def _derive_file_name(language: str, idx: int) -> str:
    exts = {
        "python": f"code_{idx+1}.py",
        "javascript": f"code_{idx+1}.js",
        "typescript": f"code_{idx+1}.ts",
        "tsx": f"code_{idx+1}.tsx",
        "jsx": f"code_{idx+1}.jsx",
        "html": f"code_{idx+1}.html",
        "css": f"code_{idx+1}.css",
        "json": f"code_{idx+1}.json",
        "yaml": f"code_{idx+1}.yaml",
        "sql": f"code_{idx+1}.sql",
        "rust": f"code_{idx+1}.rs",
        "go": f"code_{idx+1}.go",
        "java": f"code_{idx+1}.java",
        "sh": f"code_{idx+1}.sh",
        "bash": f"code_{idx+1}.sh",
    }
    return exts.get(language, f"code_{idx+1}.{language or 'txt'}")


def _preview_title(url: str, idx: int) -> str:
    try:
        from urllib.parse import urlparse
        host = urlparse(url).netloc
        return f"{host} #{idx + 1}"
    except Exception:
        return f"链接预览 #{idx + 1}"


def _try_fetch_og(url: str) -> Dict:
    try:
        from app.services.og_fetcher import fetch_og_metadata
        return fetch_og_metadata(url)
    except Exception:
        logger.debug("OG fetch skipped for %s", url)
        return {}
