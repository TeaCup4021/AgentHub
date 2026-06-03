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
from app.services.adk.tool_loader import register_builtin


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

    Args:
        file_path: Absolute or relative path where the file should be created.
        content: The text content to write into the file.

    Returns:
        JSON string with file metadata including download_url.
    """
    try:
        os.makedirs(os.path.dirname(os.path.abspath(file_path)), exist_ok=True)
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
        content_bytes = content.encode("utf-8")
        storage.upload_file(content_bytes, f"files/{file_id}", mime_type)
        result = {
            "status": "created",
            "file_path": file_path,
            "file_id": file_id,
            "download_url": f"/api/v1/files/{file_id}/download",
            "file_name": file_name,
            "file_size": len(content_bytes),
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
