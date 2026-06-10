"""Office document to PDF conversion via the Gotenberg service."""

import logging

import httpx

from app.core.config import settings

logger = logging.getLogger("agenthub.converter")


class ConversionError(RuntimeError):
    def __init__(self, message: str, *, service_unavailable: bool = False):
        super().__init__(message)
        self.message = message
        self.service_unavailable = service_unavailable


def _gotenberg_convert_url() -> str:
    return f"{settings.GOTENBERG_URL}/forms/libreoffice/convert"


def _service_unavailable_message(url: str) -> str:
    return (
        "Document conversion service is unavailable. "
        f"Start Gotenberg and make sure {url} is reachable."
    )


async def download_file(url: str) -> bytes:
    """Download a file from a URL."""
    async with httpx.AsyncClient(timeout=30, follow_redirects=True, trust_env=False) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        return resp.content


async def convert_to_pdf(file_bytes: bytes, filename: str) -> bytes:
    """Convert an Office document to PDF via Gotenberg."""
    files = {"files": (filename, file_bytes, "application/octet-stream")}

    async with httpx.AsyncClient(timeout=60, trust_env=False) as client:
        resp = await client.post(_gotenberg_convert_url(), files=files)
        resp.raise_for_status()
        return resp.content


def convert_bytes_sync(file_bytes: bytes, filename: str) -> bytes | None:
    """Compatibility wrapper returning None when conversion fails."""
    try:
        return convert_bytes_sync_or_raise(file_bytes, filename)
    except ConversionError:
        return None


def convert_bytes_sync_or_raise(file_bytes: bytes, filename: str) -> bytes:
    """Convert bytes to PDF and raise a typed error on conversion failure."""
    resp: httpx.Response | None = None
    url = _gotenberg_convert_url()
    try:
        logger.info(
            "Gotenberg convert: filename=%s size=%d url=%s",
            filename,
            len(file_bytes),
            url,
        )
        files = {"files": (filename, file_bytes, "application/octet-stream")}
        with httpx.Client(timeout=60, trust_env=False) as client:
            resp = client.post(url, files=files)
        resp.raise_for_status()
        logger.info("Gotenberg convert success: size=%d", len(resp.content))
        return resp.content
    except (httpx.ConnectError, httpx.ConnectTimeout) as exc:
        logger.exception("Gotenberg conversion service unavailable: url=%s", url)
        raise ConversionError(
            _service_unavailable_message(url),
            service_unavailable=True,
        ) from exc
    except httpx.HTTPStatusError as exc:
        status = resp.status_code if resp is not None else "N/A"
        body = (resp.text or "")[:500] if resp is not None else "N/A"
        logger.exception(
            "Gotenberg sync conversion failed: http_status=%s response_body=%s",
            status,
            body,
        )
        raise ConversionError(
            f"Document conversion failed in Gotenberg (HTTP {status}).",
        ) from exc
    except httpx.HTTPError as exc:
        logger.exception("Gotenberg sync conversion request failed: url=%s", url)
        raise ConversionError("Document conversion request failed. Check Gotenberg logs.") from exc


async def convert_url_to_pdf(url: str) -> bytes | None:
    """Download a file from URL and convert to PDF via Gotenberg."""
    try:
        filename = url.rstrip("/").split("/")[-1] or "document"
        logger.info("Downloading for conversion: %s", url)
        file_bytes = await download_file(url)
        logger.info("Converting to PDF via Gotenberg: %s (%d bytes)", filename, len(file_bytes))
        pdf_bytes = await convert_to_pdf(file_bytes, filename)
        logger.info("Conversion complete: %d bytes PDF", len(pdf_bytes))
        return pdf_bytes
    except Exception:
        logger.exception("Document to PDF conversion failed for %s", url)
        return None
