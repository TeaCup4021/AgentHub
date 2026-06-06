"""PPTX → PDF conversion via Gotenberg Docker service."""

import logging
import httpx
from io import BytesIO

from app.core.config import settings

logger = logging.getLogger("agenthub.converter")


async def download_file(url: str) -> bytes:
    """Download a file from a URL."""
    async with httpx.AsyncClient(timeout=30, follow_redirects=True, trust_env=False) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        return resp.content


async def convert_to_pdf(file_bytes: bytes, filename: str) -> bytes:
    """Convert an Office document to PDF via Gotenberg.

    Gotenberg API: POST /forms/libreoffice/convert
    """
    files = {"files": (filename, file_bytes, "application/octet-stream")}

    async with httpx.AsyncClient(timeout=60, trust_env=False) as client:
        resp = await client.post(
            f"{settings.GOTENBERG_URL}/forms/libreoffice/convert",
            files=files,
        )
        resp.raise_for_status()
        return resp.content


def convert_bytes_sync(file_bytes: bytes, filename: str) -> bytes | None:
    """Synchronous wrapper calling Gotenberg for conversion (runs in executor).

    Uses httpx sync Client — call this via run_in_executor() from async code.
    """
    import httpx as _httpx
    from app.core.config import settings as _settings

    resp = None
    try:
        logger.info(
            "Gotenberg convert: filename=%s size=%d url=%s",
            filename, len(file_bytes), f"{_settings.GOTENBERG_URL}/forms/libreoffice/convert",
        )
        files = {"files": (filename, file_bytes, "application/octet-stream")}
        resp = _httpx.Client(timeout=60, trust_env=False).post(
            f"{_settings.GOTENBERG_URL}/forms/libreoffice/convert",
            files=files,
        )
        resp.raise_for_status()
        logger.info("Gotenberg convert success: size=%d", len(resp.content))
        return resp.content
    except Exception:
        status = resp.status_code if resp is not None else "N/A"
        body = (resp.text or "")[:500] if resp is not None else "N/A"
        logger.exception(
            "Gotenberg sync conversion failed: http_status=%s response_body=%s",
            status, body,
        )
        return None


async def convert_url_to_pdf(url: str) -> bytes | None:
    """Download a file from URL and convert to PDF via Gotenberg.

    Returns PDF bytes on success, None on failure.
    """
    try:
        filename = url.rstrip("/").split("/")[-1] or "document"
        logger.info("Downloading for conversion: %s", url)
        file_bytes = await download_file(url)
        logger.info("Converting to PDF via Gotenberg: %s (%d bytes)", filename, len(file_bytes))
        pdf_bytes = await convert_to_pdf(file_bytes, filename)
        logger.info("Conversion complete: %d bytes PDF", len(pdf_bytes))
        return pdf_bytes
    except Exception:
        logger.exception("PPTX → PDF conversion failed for %s", url)
        return None
