from __future__ import annotations

from starlette.applications import Starlette
from starlette.responses import HTMLResponse
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


async def serve_preview(request):
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


preview_app = Starlette(
    routes=[Route("/{preview_id}", serve_preview)],
)
