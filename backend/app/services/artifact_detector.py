import re, json, hashlib, logging
from uuid import uuid4
from typing import List, Dict
from urllib.parse import urlparse

logger = logging.getLogger("agenthub.artifact_detector")

_CODE_BLOCK_RE = re.compile(r"```(\w+)?\s*\n(.*?)```", re.DOTALL)
_INLINE_CODE_RE = re.compile(r"`[^`\n]+`")
_URL_RE = re.compile(r"https?://[^\s\)\]>]+")

_SELF_CLOSING_ARTIFACT_RE = re.compile(
    r"<artifact\b([^>]*)/>",
    re.IGNORECASE | re.DOTALL,
)

_ARTIFACT_WITH_BODY_RE = re.compile(
    r"<artifact\b([^>]*)>(.*?)</artifact>",
    re.IGNORECASE | re.DOTALL,
)

_ATTR_RE = re.compile(r'([\w:-]+)\s*=\s*(["\'])(.*?)\2', re.DOTALL)

_CDATA_RE = re.compile(r'<!\[CDATA\[(.*?)\]\]>', re.DOTALL)

_SYSTEM_URL_PATTERNS = ["/preview/", "/files/"]
_EMBEDDABLE_DOMAINS = [
    "docs.google.com", "office.com", "notion.so",
    "figma.com", "youtube.com", "youtu.be", "vimeo.com",
]

_DOCUMENT_EXTENSIONS = {
    ".pdf": "pdf",
    ".docx": "docx",
    ".doc": "docx",
    ".xlsx": "xlsx",
    ".xls": "xlsx",
    ".pptx": "pptx",
    ".ppt": "pptx",
}
_DOCUMENT_MIME_TO_TYPE = {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/msword": "docx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/vnd.ms-excel": "xlsx",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
    "application/vnd.ms-powerpoint": "pptx",
}
_LOCAL_FILE_DOWNLOAD_RE = re.compile(
    r"(?P<url>/api/v1/files/[0-9a-fA-F-]+/download)"
    r"|(?P<full>https?://(?:localhost|127\.0\.0\.1)(?::\d+)?/api/v1/files/[0-9a-fA-F-]+/download)",
    re.IGNORECASE,
)


def build_content_hash(content: Dict) -> str:
    raw = json.dumps(content, sort_keys=True, ensure_ascii=False)
    return hashlib.md5(raw.encode()).hexdigest()[:12]


# Regexes shared with _strip_artifact_tags / strip_artifact_tags
_ARTIFACT_TAG_RE = re.compile(r'<artifact\b[^>]*>.*?</artifact>', re.DOTALL | re.IGNORECASE)
_ARTIFACT_SELF_CLOSING_RE = re.compile(r'<artifact\b[^>]*/>', re.IGNORECASE)


def strip_artifact_tags(content: str) -> str:
    """Remove <artifact> XML markup from text, keeping non-artifact content.

    Used before persisting message content so the frontend MarkdownBubble
    does not display raw XML tags (CDATA sections, etc.).
    """
    content = _ARTIFACT_TAG_RE.sub('', content)
    content = _ARTIFACT_SELF_CLOSING_RE.sub('', content)
    return content.strip()


async def detect_artifacts(content: str) -> List[Dict]:
    artifacts = await _detect_xml_artifacts(content)
    existing = {a["artifactType"] for a in artifacts}
    fallback_content = strip_artifact_tags(content)

    if "code" not in existing or "diff" not in existing:
        for a in _detect_code_blocks(fallback_content):
            if a["artifactType"] not in existing: artifacts.append(a)
        for a in _detect_diffs(fallback_content):
            if a["artifactType"] not in existing: artifacts.append(a)

    if "preview" not in existing:
        artifacts.extend(_detect_urls(fallback_content))

    for art in artifacts:
        if "id" not in art: art["id"] = str(uuid4())
    return artifacts


def _parse_attrs(attr_str: str) -> dict:
    attrs: dict[str, str] = {}
    for key, _quote, value in _ATTR_RE.findall(attr_str or ""):
        normalized = key.lower()
        if normalized == "type" and normalized in attrs:
            if "/" in value and not any(k in attrs for k in ("mime", "mimetype", "mime_type")):
                attrs["mime"] = value
            continue
        attrs[normalized] = value
    return attrs


async def _detect_xml_artifacts(content: str) -> List[Dict]:
    results = []
    for m in _SELF_CLOSING_ARTIFACT_RE.finditer(content):
        attrs = _parse_attrs(m.group(1) or "")
        art_type = attrs.get("type") or attrs.get("artifact_type") or attrs.get("artifacttype")
        if not art_type:
            continue
        a = await _build_xml_artifact(art_type, attrs, "")
        if isinstance(a, list):
            results.extend(a)
        elif a:
            results.append(a)
    for m in _ARTIFACT_WITH_BODY_RE.finditer(content):
        attrs = _parse_attrs(m.group(1) or "")
        art_type = attrs.get("type") or attrs.get("artifact_type") or attrs.get("artifacttype")
        if not art_type:
            continue
        body = m.group(2) or ""
        cdata = _CDATA_RE.search(body)
        if cdata: body = cdata.group(1)
        a = await _build_xml_artifact(art_type, attrs, body.strip())
        if isinstance(a, list):
            results.extend(a)
        elif a:
            results.append(a)
    return results


async def _build_xml_artifact(art_type: str, attrs: dict, body: str):
    art_type = (art_type or "").lower()
    t = attrs.get("title")
    lang = attrs.get("language")
    f = attrs.get("file") or attrs.get("path")
    fn = attrs.get("filename") or attrs.get("file_name")
    url = attrs.get("url")
    name = attrs.get("name")
    sz = attrs.get("size")
    mime = attrs.get("mime") or attrs.get("mimetype") or attrs.get("mime_type") or attrs.get("media-type")

    if art_type == "code":
        return {"artifactType":"code","title":t or f or "代码","content":{"language":lang or "text","code":body,"fileName":f or fn or ""}}
    if art_type == "diff":
        o, n = _split_diff_body(body)
        return {"artifactType":"diff","title":t or "变更对比","content":{"language":lang or "diff","oldCode":o,"newCode":n,"fileName":f or fn or ""}}
    if art_type == "preview":
        if body:
            u = url or await _publish_preview_html(body)
            preview_title = t or "Preview"
            file_name = f or fn or name or "index.html"
            return [
                {
                    "artifactType": "preview",
                    "title": preview_title,
                    "content": {
                        "url": u or "",
                        "title": preview_title,
                        "previewType": "web",
                    },
                },
                {
                    "artifactType": "code",
                    "title": t or file_name,
                    "content": {
                        "language": "html",
                        "code": body,
                        "fileName": file_name,
                    },
                },
            ]
        u = url
        if not u and body: u = await _publish_preview_html(body)
        return {"artifactType":"preview","title":t or "预览","content":{"url":u or "","title":t or "预览","previewType":"web"}}
    if art_type in {"document", "doc"}:
        file_name = name or fn or f or _derive_document_name(url or "", mime)
        file_type = _infer_document_type(file_name, mime) or "pdf"
        return {"artifactType":"document","id":_download_artifact_id(url or file_name),"title":t or file_name or "文档","content":{"fileName":file_name or "document.pdf","fileUrl":url or "","fileType":file_type,"fileSize":int(sz) if sz and sz.isdigit() else 0}}
    if art_type == "file":
        file_name = name or fn or f or _derive_document_name(url or "", mime)
        file_size = int(sz) if sz and sz.isdigit() else 0
        doc_type = _infer_document_type(file_name, mime)
        if doc_type:
            return {"artifactType":"document","id":_download_artifact_id(url or file_name),"title":t or file_name or "文档","content":{"fileName":file_name or f"document.{doc_type}","fileUrl":url or "","fileType":doc_type,"fileSize":file_size}}
        return {"artifactType":"file","id":_download_artifact_id(url or file_name),"title":t or file_name or "文件","content":{"fileName":file_name or "","fileUrl":url or "","fileType":mime or "application/octet-stream","fileSize":file_size}}
    if art_type == "deploy_status":
        requested = not url or url == "DEPLOY_REQUEST"
        status = attrs.get("status") or ("building" if requested else "deployed")
        content = {"status": status, "url": url or "DEPLOY_REQUEST"}
        port = attrs.get("port")
        if port and port.isdigit():
            content["port"] = int(port)
        return {"artifactType":"deploy_status","title":t or "部署","content":content}
    return None


def _split_diff_body(body):
    bm, am = "--- before", "+++ after"
    if bm in body and am in body:
        parts = body.split(bm, 1)[1].split(am, 1)
        return parts[0].strip(), parts[1].strip()
    o, n = [], []
    for line in body.split("\n"):
        if line.startswith("---") or line.startswith("+++") or line.startswith("@@"): continue
        if line.startswith("-"): o.append(line[1:])
        elif line.startswith("+"): n.append(line[1:])
        elif line.startswith(" "): t=line[1:]; o.append(t); n.append(t)
        elif line.strip(): o.append(line); n.append(line)
    return "\n".join(o), "\n".join(n)


async def _publish_preview_html(html):
    import asyncio
    from app.services.storage import upload_file
    from app.core.config import settings
    pid = str(uuid4())
    try:
        await asyncio.get_event_loop().run_in_executor(
            None, lambda: upload_file(html.encode("utf-8"), f"previews/{pid}.html", "text/html")
        )
        return f"{settings.PREVIEW_SERVER_URL}/preview/{pid}"
    except Exception:
        logger.exception("publish_preview_html failed")
        return ""


def _detect_code_blocks(content):
    r = []
    for i, m in enumerate(_CODE_BLOCK_RE.finditer(content)):
        lang = (m.group(1) or "").strip()
        if lang == "diff": continue
        code = m.group(2)
        r.append({"artifactType":"code","title":_derive_code_title(lang,i),"content":{"language":lang or "text","code":code.strip(),"fileName":_derive_file_name(lang,i)}})
    return r


def _detect_diffs(content):
    r = []
    for i, m in enumerate(_CODE_BLOCK_RE.finditer(content)):
        lang = (m.group(1) or "").strip()
        if lang != "diff": continue
        o, n = _split_diff(m.group(2))
        r.append({"artifactType":"diff","title":f"变更对比 #{i+1}","content":{"language":"diff","oldCode":o,"newCode":n,"fileName":""}})
    return r


def _is_system_url(url):
    if _is_file_download_url(url):
        return False
    if any(p in url for p in _SYSTEM_URL_PATTERNS):
        return True
    try:
        from app.core.config import settings

        parsed = urlparse(url)
        hostname = (parsed.hostname or "").lower()
        if hostname not in {"localhost", "127.0.0.1"}:
            return False
        if parsed.port != settings.PREVIEW_SERVER_PORT:
            return False
        path = (parsed.path or "").lower()
        return path in {"", "/"} or path.endswith((".html", ".htm"))
    except Exception:
        return False


def _is_embeddable(url):
    u = url.lower()
    if any(u.endswith(e) for e in [".pdf",".doc",".xls",".ppt"]): return True
    if any(d in u for d in _EMBEDDABLE_DOMAINS): return True
    # 普通 http/https 链接默认不可 iframe 内嵌：多数站点设置 X-Frame-Options:
    # DENY/SAMEORIGIN 或 CSP frame-ancestors，强行内嵌会显示"拒绝连接"。
    # 只对已知可嵌入域名（_EMBEDDABLE_DOMAINS）和文档文件内嵌，其余降级为
    # LinkPreviewCard（OG 卡片 + 新标签页打开）。
    return False



def _detect_urls(content):
    c = _INLINE_CODE_RE.sub(" ", content); c = _CODE_BLOCK_RE.sub("", c)
    seen, r = set(), []
    r.extend(_detect_local_file_downloads(c))
    for i, m in enumerate(_URL_RE.finditer(c)):
        url = m.group(0).rstrip(".,;:!?，。；：！？、\"'`)]*_")
        if url in seen: continue
        seen.add(url)
        if _is_file_download_url(url): continue
        if _is_system_url(url): continue
        if _is_embeddable(url):
            pt = "doc" if any(d in url.lower() for d in ["docs.google.com","office.com","notion.so","figma.com",".pdf",".doc",".xls",".ppt"]) else "web"
            r.append({"artifactType":"preview","title":_preview_title(url,i),"content":{"url":url,"title":url,"previewType":pt}})
        else:
            og = _try_fetch_og(url)
            r.append({"artifactType":"link_preview","title":og.get("title") or _preview_title(url,i),"content":{"url":url,"title":og.get("title"),"description":og.get("description"),"image":og.get("image"),"favicon":og.get("favicon"),"siteName":og.get("site_name")}})
    return r


def _split_diff(diff_text):
    o, n = [], []
    for line in diff_text.split("\n"):
        if line.startswith("---") or line.startswith("+++") or line.startswith("@@"): continue
        if line.startswith("-"): o.append(line[1:])
        elif line.startswith("+"): n.append(line[1:])
        elif line.startswith(" "): t=line[1:]; o.append(t); n.append(t)
        elif line.strip(): o.append(line); n.append(line)
    return "\n".join(o), "\n".join(n)


def _derive_code_title(lang, i): return f"{lang} 代码 #{i+1}" if lang else f"代码 #{i+1}"

def _derive_file_name(lang, i):
    exts = {"python":f"code_{i+1}.py","javascript":f"code_{i+1}.js","typescript":f"code_{i+1}.ts","tsx":f"code_{i+1}.tsx","jsx":f"code_{i+1}.jsx","html":f"code_{i+1}.html","css":f"code_{i+1}.css","json":f"code_{i+1}.json","yaml":f"code_{i+1}.yaml","sql":f"code_{i+1}.sql","rust":f"code_{i+1}.rs","go":f"code_{i+1}.go","java":f"code_{i+1}.java","sh":f"code_{i+1}.sh","bash":f"code_{i+1}.sh"}
    return exts.get(lang, f"code_{i+1}.{lang or 'txt'}")

def _preview_title(url, i):
    try:
        from urllib.parse import urlparse
        return f"{urlparse(url).netloc} #{i+1}"
    except: return f"链接预览 #{i+1}"

def _try_fetch_og(url):
    try:
        from app.services.og_fetcher import fetch_og_metadata
        return fetch_og_metadata(url)
    except:
        logger.debug("OG fetch skipped for %s", url)
        return {}


def _is_file_download_url(url: str) -> bool:
    if not url:
        return False
    path = urlparse(url).path if url.startswith(("http://", "https://")) else url
    return bool(re.fullmatch(r"/api/v1/files/[0-9a-fA-F-]+/download", path))


def _infer_document_type(file_name: str, mime: str | None = None) -> str | None:
    mime_key = (mime or "").split(";", 1)[0].strip().lower()
    if mime_key in _DOCUMENT_MIME_TO_TYPE:
        return _DOCUMENT_MIME_TO_TYPE[mime_key]
    lower_name = (file_name or "").lower()
    for ext, file_type in _DOCUMENT_EXTENSIONS.items():
        if lower_name.endswith(ext):
            return file_type
    return None


def _derive_document_name(url: str, mime: str | None = None) -> str:
    try:
        path = urlparse(url).path if url.startswith(("http://", "https://")) else url
        name = path.rstrip("/").split("/")[-1]
    except Exception:
        name = ""
    if "." in name:
        return name
    file_type = _infer_document_type("", mime) or "pdf"
    return f"document.{file_type}"


def build_download_artifact(metadata: dict) -> dict | None:
    """Build a file/document artifact from tool output metadata."""
    if not isinstance(metadata, dict):
        return None
    url = metadata.get("download_url") or metadata.get("downloadUrl") or metadata.get("file_url") or metadata.get("fileUrl")
    if not isinstance(url, str) or not url:
        return None
    name = (
        metadata.get("file_name") or metadata.get("fileName") or
        metadata.get("filename") or metadata.get("name") or
        _derive_document_name(url, metadata.get("mime_type") or metadata.get("mimeType"))
    )
    mime = metadata.get("mime_type") or metadata.get("mimeType") or metadata.get("mime")
    raw_size = metadata.get("file_size") or metadata.get("fileSize") or metadata.get("size") or 0
    try:
        size = int(raw_size)
    except (TypeError, ValueError):
        size = 0
    doc_type = _infer_document_type(str(name), str(mime or ""))
    artifact_id = metadata.get("id") or _download_artifact_id(url)
    if doc_type:
        return {
            "artifactType": "document",
            "id": str(artifact_id),
            "title": str(name) or "文档",
            "content": {
                "fileName": str(name) or f"document.{doc_type}",
                "fileUrl": url,
                "fileType": doc_type,
                "fileSize": size,
            },
        }
    return {
        "artifactType": "file",
        "id": str(artifact_id),
        "title": str(name) or "文件",
        "content": {
            "fileName": str(name) or "",
            "fileUrl": url,
            "fileType": str(mime or "application/octet-stream"),
            "fileSize": size,
        },
    }


def _download_artifact_id(value: str) -> str:
    digest = hashlib.md5((value or "download").encode("utf-8")).hexdigest()[:12]
    return f"download-{digest}"


def extract_download_artifacts_from_tool_response(response) -> list[dict]:
    """Extract file artifacts from ADK FunctionResponse payloads."""
    candidates: list[dict] = []

    def visit(value) -> None:
        if isinstance(value, dict):
            artifact = build_download_artifact(value)
            if artifact:
                candidates.append(artifact)
            for nested in value.values():
                visit(nested)
            return
        if isinstance(value, list):
            for item in value:
                visit(item)
            return
        if isinstance(value, str):
            for parsed in _iter_json_objects(value):
                visit(parsed)

    visit(response)
    return _dedupe_download_artifacts(candidates)


def _iter_json_objects(text: str):
    decoder = json.JSONDecoder()
    index = 0
    while index < len(text):
        start = text.find("{", index)
        if start < 0:
            break
        try:
            obj, end = decoder.raw_decode(text[start:])
            yield obj
            index = start + end
        except json.JSONDecodeError:
            index = start + 1


def _dedupe_download_artifacts(artifacts: list[dict]) -> list[dict]:
    result: list[dict] = []
    seen: set[tuple[str, str]] = set()
    for artifact in artifacts:
        content = artifact.get("content") if isinstance(artifact, dict) else {}
        key = (
            str(artifact.get("artifactType") or ""),
            str(content.get("fileUrl") if isinstance(content, dict) else ""),
        )
        if not key[1] or key in seen:
            continue
        seen.add(key)
        result.append(artifact)
    return result


def _detect_local_file_downloads(content: str) -> list[dict]:
    results: list[dict] = []
    seen: set[str] = set()
    for match in _LOCAL_FILE_DOWNLOAD_RE.finditer(content or ""):
        url = match.group("url") or match.group("full") or ""
        url = url.rstrip(".,;:!?，。；：！？、\"'`)]*_")
        if not url or url in seen:
            continue
        seen.add(url)
        artifact = build_download_artifact({
            "download_url": url,
            "file_name": "document.pdf",
            "mime_type": "application/pdf",
        })
        if artifact:
            results.append(artifact)
    return results


async def _maybe_convert_pptx(doc_url: str, file_type: str, filename: str) -> tuple[str, str]:
    """Convert PPTX files to PDF via Gotenberg if applicable.

    Returns (final_url, final_type).
    - For PPTX: attempts conversion, returns (pdf_url, "pdf") on success or (doc_url, "pptx") on failure
    - For other types: returns (doc_url, file_type) unchanged
    """
    if file_type != "pptx":
        return doc_url, file_type

    try:
        import asyncio
        from uuid import uuid4
        from app.services.storage import upload_file, get_file
        from app.services.converter import convert_bytes_sync

        # Extract file_id from doc_url (format: /api/v1/files/{file_id}/download)
        file_id = doc_url.split("/")[-2] if "/" in doc_url else None
        if not file_id:
            logger.warning("Cannot extract file_id from %s", doc_url)
            return doc_url, file_type

        # Download the PPTX file from MinIO
        pptx_bytes = get_file(f"files/{file_id}")

        # Convert PPTX → PDF via Gotenberg (sync function in executor)
        pdf_bytes = await asyncio.get_event_loop().run_in_executor(
            None, lambda: convert_bytes_sync(pptx_bytes, filename)
        )

        if pdf_bytes:
            # Upload converted PDF to MinIO
            pdf_file_id = str(uuid4())
            await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: upload_file(
                    pdf_bytes,
                    f"conversions/{pdf_file_id}.pdf",
                    "application/pdf",
                ),
            )
            pdf_url = f"/api/v1/files/{pdf_file_id}/download"
            logger.info(
                "CLI artifact PPTX converted: %s → %s (%d bytes)",
                filename, pdf_url, len(pdf_bytes)
            )
            return pdf_url, "pdf"
        else:
            logger.warning("PPTX conversion failed for %s, using original", filename)
            return doc_url, file_type

    except Exception:
        logger.exception("_maybe_convert_pptx failed for %s", filename)
        return doc_url, file_type
