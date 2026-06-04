import re, json, hashlib, logging
from uuid import uuid4
from typing import List, Dict

logger = logging.getLogger("agenthub.artifact_detector")

_CODE_BLOCK_RE = re.compile(r"```(\w+)?\s*\n(.*?)```", re.DOTALL)
_INLINE_CODE_RE = re.compile(r"`[^`\n]+`")
_URL_RE = re.compile(r"https?://[^\s\)\]>]+")

_SELF_CLOSING_ARTIFACT_RE = re.compile(
    r'<artifact\s+type="(\w+)"\s+'
    r'(?:title="([^"]*)")?\s*(?:language="([^"]*)")?\s*'
    r'(?:file="([^"]*)")?\s*(?:filename="([^"]*)")?\s*'
    r'(?:url="([^"]*)")?\s*(?:name="([^"]*)")?\s*'
    r'(?:size="([^"]*)")?\s*(?:type="([^"]*)")?\s*/>',
    re.IGNORECASE | re.DOTALL)

_ARTIFACT_WITH_BODY_RE = re.compile(
    r'<artifact\s+type="(code|diff|preview)"'
    r'((?:\s+\w+="[^"]*")*)\s*>(.*?)</artifact>',
    re.IGNORECASE | re.DOTALL)

_ATTR_RE = re.compile(r'(\w+)="([^"]*)"')

_CDATA_RE = re.compile(r'<!\[CDATA\[(.*?)\]\]>', re.DOTALL)

_SYSTEM_URL_PATTERNS = ["/preview/", "/files/"]
_EMBEDDABLE_DOMAINS = [
    "docs.google.com", "office.com", "notion.so",
    "figma.com", "youtube.com", "youtu.be", "vimeo.com",
]


def build_content_hash(content: Dict) -> str:
    raw = json.dumps(content, sort_keys=True, ensure_ascii=False)
    return hashlib.md5(raw.encode()).hexdigest()[:12]


async def detect_artifacts(content: str) -> List[Dict]:
    artifacts = await _detect_xml_artifacts(content)
    existing = {a["artifactType"] for a in artifacts}

    if "code" not in existing or "diff" not in existing:
        for a in _detect_code_blocks(content):
            if a["artifactType"] not in existing: artifacts.append(a)
        for a in _detect_diffs(content):
            if a["artifactType"] not in existing: artifacts.append(a)

    if "preview" not in existing:
        artifacts.extend(_detect_urls(content))

    for art in artifacts:
        if "id" not in art: art["id"] = str(uuid4())
    return artifacts


def _parse_attrs(attr_str: str) -> dict:
    return dict(_ATTR_RE.findall(attr_str))


async def _detect_xml_artifacts(content: str) -> List[Dict]:
    results = []
    for m in _SELF_CLOSING_ARTIFACT_RE.finditer(content):
        g = m.groups()
        art_type = g[0]
        attrs = {"title": g[1] if len(g) > 1 else None,
                 "language": g[2] if len(g) > 2 else None, "file": g[3] if len(g) > 3 else None,
                 "filename": g[4] if len(g) > 4 else None, "url": g[5] if len(g) > 5 else None,
                 "name": g[6] if len(g) > 6 else None, "size": g[7] if len(g) > 7 else None,
                 "mime": g[8] if len(g) > 8 else None}
        a = await _build_xml_artifact(art_type, attrs, "")
        if a: results.append(a)
    for m in _ARTIFACT_WITH_BODY_RE.finditer(content):
        art_type = m.group(1)
        attr_str = m.group(2) or ""
        body = m.group(3) or ""
        cdata = _CDATA_RE.search(body)
        if cdata: body = cdata.group(1)
        attrs = _parse_attrs(attr_str)
        a = await _build_xml_artifact(art_type, attrs, body.strip())
        if a: results.append(a)
    return results


async def _build_xml_artifact(art_type: str, attrs: dict, body: str):
    t = attrs.get("title")
    lang = attrs.get("language")
    f = attrs.get("file")
    fn = attrs.get("filename")
    url = attrs.get("url")
    name = attrs.get("name")
    sz = attrs.get("size")
    mime = attrs.get("mime")

    if art_type == "code":
        return {"artifactType":"code","title":t or f or "代码","content":{"language":lang or "text","code":body,"fileName":f or fn or ""}}
    if art_type == "diff":
        o, n = _split_diff_body(body)
        return {"artifactType":"diff","title":t or "变更对比","content":{"language":lang or "diff","oldCode":o,"newCode":n,"fileName":f or fn or ""}}
    if art_type == "preview":
        u = url
        if not u and body: u = await _publish_preview_html(body)
        return {"artifactType":"preview","title":t or "预览","content":{"url":u or "","title":t or "预览","previewType":"web"}}
    if art_type == "file":
        return {"artifactType":"file","title":name or "文件","content":{"fileName":name or "","fileUrl":url or "","fileType":mime or "application/octet-stream","fileSize":int(sz) if sz and sz.isdigit() else 0}}
    if art_type == "deploy_status":
        return {"artifactType":"deploy_status","title":t or "部署","content":{"status":"deployed","url":url or ""}}
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


def _is_system_url(url): return any(p in url for p in _SYSTEM_URL_PATTERNS)


def _is_embeddable(url):
    u = url.lower()
    if any(u.endswith(e) for e in [".pdf",".doc",".xls",".ppt"]): return True
    if any(d in u for d in _EMBEDDABLE_DOMAINS): return True
    # 所有 http/https 链接都作为可预览网页处理
    return u.startswith("http")



def _detect_urls(content):
    c = _INLINE_CODE_RE.sub(" ", content); c = _CODE_BLOCK_RE.sub("", c)
    seen, r = set(), []
    for i, m in enumerate(_URL_RE.finditer(c)):
        url = m.group(0).rstrip(".,;:!?\"'`)]*_")
        if url in seen: continue
        seen.add(url)
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
