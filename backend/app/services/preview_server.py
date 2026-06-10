"""Preview and artifact-serving sub-applications mounted on the main FastAPI app.

- /preview/{preview_id}  — sandboxed iframe preview of a single HTML page
- /serve/{conv_id}/{file_path} — persistent file hosting for multi-file artifacts
"""

from __future__ import annotations

import mimetypes
from pathlib import PurePosixPath
from urllib.parse import urlparse

from starlette.applications import Starlette
from starlette.responses import HTMLResponse, PlainTextResponse, Response
from starlette.routing import Route

from app.services.storage import get_file

_CSP_HEADER = (
    "default-src 'self' 'unsafe-inline'; "
    "style-src 'self' 'unsafe-inline'; "
    "img-src data: https:; "
    "script-src 'self' 'unsafe-inline'; "
    "connect-src *; "
    "frame-src 'none'"
)

# ---------------------------------------------------------------------------
# MIME type helpers
# ---------------------------------------------------------------------------

# Ensure standard web types are recognised even on platforms where the
# system mime database is thin.
_MIME_OVERRIDES: dict[str, str] = {
    ".html": "text/html; charset=utf-8",
    ".htm": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".mjs": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".ico": "image/x-icon",
    ".webp": "image/webp",
    ".woff2": "font/woff2",
    ".woff": "font/woff",
    ".ttf": "font/ttf",
    ".txt": "text/plain; charset=utf-8",
    ".xml": "application/xml; charset=utf-8",
    ".pdf": "application/pdf",
    ".wasm": "application/wasm",
}


def _guess_mime(file_path: str) -> str:
    """Return a media-type for *file_path*, preferring known web types."""
    suffix = PurePosixPath(file_path).suffix.lower()
    if suffix in _MIME_OVERRIDES:
        return _MIME_OVERRIDES[suffix]
    guessed, _ = mimetypes.guess_type(file_path, strict=False)
    return guessed or "application/octet-stream"


def _file_response(content: bytes, file_path: str) -> Response:
    mime = _guess_mime(file_path)
    if mime.startswith("text/") and "html" not in mime:
        return PlainTextResponse(
            content.decode("utf-8", errors="replace"),
            headers={"Content-Type": mime},
        )
    return Response(content=content, media_type=mime)


# ---------------------------------------------------------------------------
# /preview — sandboxed single-page preview (existing)
# ---------------------------------------------------------------------------


async def _serve_preview(request):
    preview_id = request.path_params["preview_id"]
    try:
        html = get_file(f"previews/{preview_id}.html")
    except Exception:
        return HTMLResponse("<h1>Preview not found</h1>", status_code=404)
    return HTMLResponse(
        content=html,
        headers={
            "Content-Security-Policy": _CSP_HEADER,
            "X-Content-Type-Options": "nosniff",
        },
    )


preview_app = Starlette(routes=[Route("/{preview_id}", _serve_preview)])


# ---------------------------------------------------------------------------
# /serve — persistent multi-file artifact hosting
# ---------------------------------------------------------------------------


async def _serve_artifact(request):
    """Serve a file stored under ``serve/{conv_id}/{file_path}`` in MinIO."""
    conv_id = request.path_params["conv_id"]
    file_path = request.path_params.get("file_path", "").lstrip("/") or "index.html"

    # When the URL ends with a slash, serve index.html from that directory.
    if request.url.path.endswith("/"):
        file_path = (file_path.rstrip("/") + "/index.html").lstrip("/")

    object_name = f"serve/{conv_id}/{file_path}"
    try:
        content = get_file(object_name)
    except Exception:
        return HTMLResponse(
            f"<h1>404 — File not found</h1><p><code>/{object_name}</code></p>",
            status_code=404,
        )

    return _file_response(content, file_path)


async def _serve_root_asset(request):
    """Serve absolute asset paths emitted by bundlers using the Referer URL.

    Some Vite builds emit ``/assets/...`` when no base is configured. When a
    preview is opened under ``/serve/{conv}/{deployment}/index.html``, those
    absolute requests otherwise hit the API root and 404.
    """
    file_path = request.path_params.get("file_path", "").lstrip("/")
    referer = request.headers.get("referer") or request.headers.get("Referer") or ""
    referer_path = urlparse(referer).path
    parts = [p for p in referer_path.split("/") if p]
    if len(parts) < 3 or parts[0] != "serve":
        return HTMLResponse("<h1>404 - Asset not found</h1>", status_code=404)

    conv_id = parts[1]
    deployment_id = parts[2]
    object_name = f"serve/{conv_id}/{deployment_id}/assets/{file_path}"
    try:
        content = get_file(object_name)
    except Exception:
        return HTMLResponse(
            f"<h1>404 - Asset not found</h1><p><code>/{object_name}</code></p>",
            status_code=404,
        )
    return _file_response(content, f"assets/{file_path}")


serve_app = Starlette(
    routes=[Route("/{conv_id:str}/{file_path:path}", _serve_artifact)],
)

asset_app = Starlette(
    routes=[Route("/{file_path:path}", _serve_root_asset)],
)
