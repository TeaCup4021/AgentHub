"""Builtin tool registrations for local file and OS operations.

Importing this module triggers ``@register_builtin`` decorations,
making basic operations available as ADK FunctionTools.
"""

from __future__ import annotations

import json
import os
import uuid
import asyncio
import mimetypes
import re
from app.services.adk.tool_loader import register_builtin


_PDF_LITERAL_RE = re.compile(r"\((?:\\.|[^\\()])*\)")
_PDF_HEX_RE = re.compile(r"<([0-9A-Fa-f\s]+)>")
_PDF_ARRAY_TJ_RE = re.compile(r"\[(.*?)\]\s*TJ", re.DOTALL)
_PDF_TEXT_TJ_RE = re.compile(r"(\((?:\\.|[^\\()])*\)|<[0-9A-Fa-f\s]+>)\s*Tj", re.DOTALL)


def _wrap_pdf_text(text: str, max_units: int = 78) -> list[str]:
    lines: list[str] = []
    for raw_line in (text or "").replace("\r\n", "\n").split("\n"):
        if not raw_line:
            lines.append("")
            continue
        current = ""
        units = 0
        for ch in raw_line:
            ch_units = 2 if ord(ch) > 127 else 1
            if current and units + ch_units > max_units:
                lines.append(current)
                current = ch
                units = ch_units
            else:
                current += ch
                units += ch_units
        lines.append(current)
    return lines or ["Sample PDF document"]


def _pdf_hex(text: str) -> str:
    return text.encode("utf-16-be", errors="replace").hex().upper()


def _decode_pdf_literal(value: str) -> str:
    body = value[1:-1]
    result: list[str] = []
    i = 0
    while i < len(body):
        ch = body[i]
        if ch != "\\":
            result.append(ch)
            i += 1
            continue
        i += 1
        if i >= len(body):
            break
        esc = body[i]
        if esc in "nrtbf":
            result.append({
                "n": "\n",
                "r": "\r",
                "t": "\t",
                "b": "\b",
                "f": "\f",
            }[esc])
            i += 1
        elif esc in "\\()":
            result.append(esc)
            i += 1
        elif esc in "\r\n":
            if esc == "\r" and i + 1 < len(body) and body[i + 1] == "\n":
                i += 2
            else:
                i += 1
        elif esc.isdigit():
            octal = esc
            i += 1
            for _ in range(2):
                if i < len(body) and body[i].isdigit():
                    octal += body[i]
                    i += 1
                else:
                    break
            try:
                result.append(chr(int(octal, 8)))
            except ValueError:
                result.append(octal)
        else:
            result.append(esc)
            i += 1
    return "".join(result)


def _decode_pdf_hex(value: str) -> str:
    raw_hex = "".join(value.split())
    if len(raw_hex) % 2:
        raw_hex += "0"
    try:
        raw = bytes.fromhex(raw_hex)
    except ValueError:
        return ""
    for encoding in ("utf-16-be", "utf-8", "latin-1"):
        try:
            decoded = raw.decode(encoding).strip("\ufeff")
        except UnicodeDecodeError:
            continue
        if decoded:
            return decoded
    return ""


def _decode_pdf_string_token(token: str) -> str:
    token = token.strip()
    if token.startswith("(") and token.endswith(")"):
        return _decode_pdf_literal(token)
    if token.startswith("<") and token.endswith(">"):
        return _decode_pdf_hex(token[1:-1])
    return ""


def _extract_pdf_source_text(content: str) -> str:
    if not (content or "").lstrip().startswith("%PDF-"):
        return content

    lines: list[str] = []
    for match in _PDF_TEXT_TJ_RE.finditer(content):
        text = _decode_pdf_string_token(match.group(1))
        if text.strip():
            lines.append(text.strip())

    for match in _PDF_ARRAY_TJ_RE.finditer(content):
        parts: list[str] = []
        body = match.group(1)
        for literal in _PDF_LITERAL_RE.findall(body):
            parts.append(_decode_pdf_literal(literal))
        for hex_match in _PDF_HEX_RE.finditer(body):
            parts.append(_decode_pdf_hex(hex_match.group(1)))
        text = "".join(parts).strip()
        if text:
            lines.append(text)

    extracted = "\n".join(lines).strip()
    return extracted or content


def _make_simple_pdf(content: str) -> bytes:
    """Create a small Unicode text PDF without external dependencies."""
    lines = _wrap_pdf_text(_extract_pdf_source_text(content))
    lines_per_page = 44
    pages = [lines[i:i + lines_per_page] for i in range(0, len(lines), lines_per_page)] or [[""]]

    objects: list[bytes] = []

    def add_object(body: bytes) -> int:
        objects.append(body)
        return len(objects)

    catalog_id = add_object(b"<< /Type /Catalog /Pages 2 0 R >>")
    pages_id = add_object(b"")  # filled after page objects are known
    font_id = add_object(
        b"<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light "
        b"/Encoding /UniGB-UCS2-H /DescendantFonts [ << /Type /Font "
        b"/Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo "
        b"<< /Registry (Adobe) /Ordering (GB1) /Supplement 2 >> "
        b"/FontDescriptor << /Type /FontDescriptor /FontName /STSong-Light "
        b"/Flags 4 /FontBBox [0 -200 1000 900] /ItalicAngle 0 "
        b"/Ascent 880 /Descent -120 /CapHeight 880 /StemV 80 >> >> ] >>"
    )
    assert catalog_id == 1 and pages_id == 2 and font_id == 3

    page_ids: list[int] = []
    for page_index, page_lines in enumerate(pages, start=1):
        stream_lines = [
            "q",
            "BT",
            "/F1 12 Tf",
            "50 790 Td",
            "16 TL",
        ]
        for line in page_lines:
            stream_lines.append(f"<{_pdf_hex(line)}> Tj")
            stream_lines.append("T*")
        stream_lines.extend(["ET", "Q"])
        stream = ("\n".join(stream_lines) + "\n").encode("ascii")
        content_id = add_object(
            b"<< /Length " + str(len(stream)).encode("ascii") + b" >>\nstream\n"
            + stream
            + b"endstream"
        )
        page_id = add_object(
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
            b"/Resources << /Font << /F1 3 0 R >> >> /Contents "
            + str(content_id).encode("ascii")
            + b" 0 R >>"
        )
        page_ids.append(page_id)

    kids = b" ".join(f"{page_id} 0 R".encode("ascii") for page_id in page_ids)
    objects[pages_id - 1] = (
        b"<< /Type /Pages /Kids [ " + kids + b" ] /Count "
        + str(len(page_ids)).encode("ascii") + b" >>"
    )

    output = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]
    for index, obj in enumerate(objects, start=1):
        offsets.append(len(output))
        output.extend(f"{index} 0 obj\n".encode("ascii"))
        output.extend(obj)
        output.extend(b"\nendobj\n")

    xref_offset = len(output)
    output.extend(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
    output.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        output.extend(f"{offset:010d} 00000 n \n".encode("ascii"))
    output.extend(
        b"trailer\n<< /Size " + str(len(objects) + 1).encode("ascii")
        + b" /Root 1 0 R >>\nstartxref\n"
        + str(xref_offset).encode("ascii")
        + b"\n%%EOF\n"
    )
    return bytes(output)


@register_builtin("read_file")
async def read_file(file_path: str) -> str:
    """Reads the content of a local file.

    Args:
        file_path: Absolute or relative path to the file.

    Returns:
        The content of the file or an error message.
    """
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return f.read()
    except Exception as e:
        return f"Error reading file {file_path}: {str(e)}"


@register_builtin("create_file")
async def create_file(file_path: str, content: str) -> str:
    """Creates a new file with the specified content.

    If file_path ends with .pdf, this tool creates a real PDF file and uploads it
    with application/pdf so users can download a PDF directly.

    Args:
        file_path: Absolute or relative path where the file should be created.
            Use a .pdf suffix when the user asks for a PDF download link.
        content: The text content to write into the file.

    Returns:
        JSON string with file metadata including download_url.
    """
    try:
        os.makedirs(os.path.dirname(os.path.abspath(file_path)), exist_ok=True)
        is_pdf = file_path.lower().endswith(".pdf")
        file_bytes = _make_simple_pdf(content) if is_pdf else content.encode("utf-8")
        if is_pdf:
            with open(file_path, "wb") as f:
                f.write(file_bytes)
        else:
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(content)
    except Exception as e:
        return f"Error creating file {file_path}: {str(e)}"

    try:
        from app.services import storage
        file_id = str(uuid.uuid4())
        mime_type, _ = mimetypes.guess_type(file_path)
        mime_type = mime_type or "text/plain"
        file_name = os.path.basename(file_path)
        storage.upload_file(file_bytes, f"files/{file_id}", mime_type)
        result = {
            "status": "created",
            "file_path": file_path,
            "file_id": file_id,
            "download_url": f"/api/v1/files/{file_id}/download",
            "file_name": file_name,
            "file_size": len(file_bytes),
            "mime_type": mime_type,
        }
        return f"Successfully created file {file_path}\n{json.dumps(result, ensure_ascii=False)}"
    except Exception:
        return f"Successfully created file {file_path} (storage unavailable)"


@register_builtin("edit_file")
async def edit_file(file_path: str, old_string: str, new_string: str) -> str:
    """Edits an existing file by replacing old_string with new_string.

    Args:
        file_path: Absolute or relative path to the file.
        old_string: The exact string to be replaced.
        new_string: The string to replace with.

    Returns:
        A success message or an error message.
    """
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()

        if old_string not in content:
            return f"Error: old_string not found in file {file_path}"

        content = content.replace(old_string, new_string)

        with open(file_path, "w", encoding="utf-8") as f:
            f.write(content)
        return f"Successfully edited file {file_path}"
    except Exception as e:
        return f"Error editing file {file_path}: {str(e)}"


@register_builtin("execute_command")
async def execute_command(command: str, cwd: str = ".") -> str:
    """Executes a shell command on the host operating system.

    Args:
        command: The shell command to run.
        cwd: The working directory for the command execution (default: current directory).

    Returns:
        The standard output/error of the command or an error message.
    """
    try:
        process = await asyncio.create_subprocess_shell(
            command,
            cwd=cwd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await process.communicate()

        result = []
        if stdout:
            result.append(f"STDOUT:\n{stdout.decode('utf-8', errors='replace')}")
        if stderr:
            result.append(f"STDERR:\n{stderr.decode('utf-8', errors='replace')}")
        return "\n".join(result) if result else "Command executed successfully with no output."
    except Exception as e:
        return f"Error executing command: {str(e)}"


@register_builtin("web_search")
async def web_search(query: str) -> str:
    """Searches the web for the given query using a mock placeholder.

    Args:
        query: The search query string.

    Returns:
        Search results as a JSON string or an error message.
    """
    import urllib.request
    import urllib.parse

    try:
        url = f"https://html.duckduckgo.com/html/?q={urllib.parse.quote(query)}"
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"},
        )
        loop = asyncio.get_event_loop()
        def fetch():
            with urllib.request.urlopen(req, timeout=10) as response:
                content = response.read().decode('utf-8')
                return f"Searched for: {query}. Content payload received (length: {len(content)})."
        return await loop.run_in_executor(None, fetch)
    except Exception as e:
        return f"Error in web search: {str(e)}"


@register_builtin("upload_file")
async def upload_file_tool(file_path: str) -> str:
    """Uploads a local file (binary or text) to cloud storage and returns a download URL.

    Use this after generating a file on disk (e.g. a PowerPoint created by python-pptx,
    an image, or any binary file that create_file can't handle). The returned download_url
    can be used in <artifact type="document" url="..."> or <artifact type="file" url="...">.

    Args:
        file_path: Path to the local file to upload.

    Returns:
        JSON string with download_url, file_id, file_name, size, and mime_type.
    """
    try:
        from app.services import storage

        file_name = os.path.basename(file_path)
        mime_type, _ = mimetypes.guess_type(file_path)
        mime_type = mime_type or "application/octet-stream"

        with open(file_path, "rb") as f:
            content = f.read()

        file_id = str(uuid.uuid4())
        # Run the synchronous upload in executor to avoid blocking
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            lambda: storage.upload_file(content, f"files/{file_id}", mime_type),
        )

        download_url = f"/api/v1/files/{file_id}/download"
        result = {
            "status": "uploaded",
            "file_id": file_id,
            "download_url": download_url,
            "file_name": file_name,
            "file_size": len(content),
            "mime_type": mime_type,
        }
        return f"File uploaded successfully\n{json.dumps(result, ensure_ascii=False)}"
    except Exception as e:
        return f"Error uploading file {file_path}: {str(e)}"


@register_builtin("preview_publish")
async def preview_publish(html: str, title: str = "") -> str:
    """Publishes HTML content as a preview page accessible via sandboxed iframe.

    Args:
        html: The full HTML content to publish.
        title: Optional page title.

    Returns:
        JSON string with preview_url and preview_id.
    """
    try:
        from app.services import storage
        from app.core.config import settings
        preview_id = str(uuid.uuid4())
        storage.upload_file(html.encode("utf-8"), f"previews/{preview_id}.html", "text/html")
        preview_url = f"{settings.PREVIEW_SERVER_URL}/preview/{preview_id}"
        result = {
            "status": "published",
            "preview_id": preview_id,
            "preview_url": preview_url,
            "title": title or "Preview",
        }
        return f"Preview published successfully\n{json.dumps(result, ensure_ascii=False)}"
    except Exception as e:
        return f"Error publishing preview: {str(e)}"
