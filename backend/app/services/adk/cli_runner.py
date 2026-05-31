"""Async subprocess runner for Claude Code and Codex CLIs.

Uses subprocess.Popen in a thread pool to avoid asyncio event loop
compatibility issues (e.g. Python 3.14 on Windows with BaseEventLoop).
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import subprocess
import sys
from dataclasses import dataclass
from typing import Any, AsyncGenerator

from app.core.config import settings

logger = logging.getLogger("agenthub.cli_runner")


@dataclass
class CliEvent:
    event_type: str  # "text" | "thinking" | "result" | "error" | "progress"
    content: str
    metadata: dict | None = None


@dataclass
class CliResult:
    success: bool
    result: str
    usage: dict | None = None
    duration_ms: int | None = None
    error: str | None = None


def _build_env() -> dict[str, str]:
    return {**os.environ, "CLICOLOR": "0", "FORCE_COLOR": "0", "NO_COLOR": "1"}


def _resolve_cli_exe(cli_path: str) -> list[str]:
    """Resolve npm .cmd shim to the actual executable.

    On Windows, passing through cmd.exe corrupts non-ASCII arguments
    (system code page vs UTF-8 mismatch). Instead, parse the .cmd file
    to find the real executable and invoke it directly with shell=False.
    """
    if sys.platform != "win32":
        return [cli_path]

    # Read the .cmd shim
    cmd_path = cli_path if cli_path.endswith(".cmd") else cli_path + ".cmd"
    if not os.path.isfile(cmd_path):
        return [cli_path]

    try:
        with open(cmd_path, encoding="utf-8", errors="replace") as f:
            content = f.read()
    except OSError:
        return [cli_path]

    dp0 = os.path.dirname(cmd_path)

    # Pattern 1: "%dp0%\node_modules\...\tool.exe" %*  (e.g. Claude Code)
    import re
    m = re.search(r'"%dp0%\\(node_modules\\[^"]+\.exe)"\s+%\*', content)
    if m:
        resolved = os.path.normpath(os.path.join(dp0, m.group(1)))
        return [resolved]

    # Pattern 2: "...%prog%..."  "%dp0%\node_modules\...\.js" %*  (e.g. Codex)
    m = re.search(r'"%dp0%\\(node_modules\\[^"]+\.js)"\s+%\*', content)
    if m:
        resolved = os.path.normpath(os.path.join(dp0, m.group(1)))
        return ["node", resolved]

    return [cli_path]


def _exec_cmd(cli_path: str, cli_args: list[str]) -> tuple[list[str], bool]:
    """Build the argument list for subprocess.Popen (always shell=False)."""
    exe_parts = _resolve_cli_exe(cli_path)
    return (exe_parts + cli_args, False)


class BaseCliRunner:
    # Set True to pass the prompt via stdin instead of CLI args.
    # Avoids Windows command-line encoding corruption for CJK text.
    _use_stdin: bool = False
    # Seconds of idle stdout before assuming the CLI is done (0 = wait for EOF).
    _idle_timeout: float = 0.0

    def __init__(self, cli_path: str, workspace_dir: str = ".") -> None:
        self._cli_path = cli_path
        self._workspace_dir = workspace_dir

    # ── subprocess helpers ───────────────────────────────────────────────

    def _run_sync(
        self, args: list[str], timeout: int, stdin_text: str = "",
    ) -> tuple[bytes, bytes]:
        """Run the CLI synchronously (called in a thread)."""
        cmd, use_shell = _exec_cmd(self._cli_path, args)
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            stdin=subprocess.PIPE if self._use_stdin else None,
            cwd=self._workspace_dir,
            env=_build_env(),
            shell=use_shell,
        )
        try:
            stdin_bytes = stdin_text.encode("utf-8") if self._use_stdin else None
            stdout_bytes, stderr_bytes = proc.communicate(input=stdin_bytes, timeout=timeout)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.communicate()
            raise
        return stdout_bytes, stderr_bytes

    def _stream_sync(
        self, args: list[str], queue: asyncio.Queue, stdin_text: str = "",
    ) -> None:
        """Run the CLI and push lines to queue (called in a thread)."""
        cmd, use_shell = _exec_cmd(self._cli_path, args)
        try:
            proc = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                stdin=subprocess.PIPE if self._use_stdin else None,
                cwd=self._workspace_dir,
                env=_build_env(),
                shell=use_shell,
                text=True,
                encoding="utf-8",
                errors="replace",
            )
            if self._use_stdin and stdin_text:
                proc.stdin.write(stdin_text)
                proc.stdin.close()

            idle = self._idle_timeout
            if idle > 0:
                # Spawn a reader thread so we can use Queue.get(timeout=)
                # to detect idle stdout. Some CLIs keep stdout open long
                # after writing their response (e.g. Codex telemetry).
                self._stream_with_idle_timeout(proc, queue, idle)
            else:
                for line in proc.stdout:
                    line = line.rstrip("\n\r")
                    if line:
                        queue.put_nowait(("line", line))
                proc.wait()
                queue.put_nowait(("done", proc.returncode))
        except Exception as e:
            queue.put_nowait(("error", str(e)))

    @staticmethod
    def _stream_with_idle_timeout(
        proc: subprocess.Popen, queue: asyncio.Queue, idle_timeout: float,
    ) -> None:
        """Read stdout with idle timeout using a reader thread."""
        import threading
        import queue as stdlib_queue

        result_q: stdlib_queue.Queue = stdlib_queue.Queue()

        def reader():
            try:
                for line in proc.stdout:
                    result_q.put(line.rstrip("\n\r"))
                result_q.put(None)  # EOF sentinel
            except Exception:
                result_q.put(None)

        t = threading.Thread(target=reader, daemon=True)
        t.start()

        has_output = False
        while True:
            try:
                line = result_q.get(
                    timeout=idle_timeout if has_output else 3600
                )
            except stdlib_queue.Empty:
                # Idle timeout — no output for idle_timeout seconds
                break

            if line is None:
                break  # EOF
            if line:
                queue.put_nowait(("line", line))
                has_output = True

        # Clean up
        if proc.poll() is None:
            proc.kill()
            proc.wait()
        queue.put_nowait(("done", proc.returncode or 0))

    # ── public API ───────────────────────────────────────────────────────

    async def run(self, prompt: str, timeout: int = 300, **kwargs: Any) -> CliResult:
        args = self._build_args(prompt, **kwargs)
        stdin_text = prompt if self._use_stdin else ""
        try:
            stdout_bytes, stderr_bytes = await asyncio.to_thread(
                self._run_sync, args, timeout, stdin_text,
            )
        except subprocess.TimeoutExpired:
            return CliResult(success=False, result="", error=f"CLI timed out after {timeout}s")
        except FileNotFoundError:
            return CliResult(
                success=False, result="",
                error=f"CLI executable not found: {self._cli_path}",
            )
        except Exception as e:
            return CliResult(success=False, result="", error=str(e))

        return self._parse_result(stdout_bytes, stderr_bytes)

    async def run_stream(
        self, prompt: str, timeout: int = 300, **kwargs: Any
    ) -> AsyncGenerator[CliEvent, None]:
        args = self._build_stream_args(prompt, **kwargs)
        stdin_text = prompt if self._use_stdin else ""
        queue: asyncio.Queue = asyncio.Queue()
        logger.info("run_stream: cli=%s prompt=%.60s", self._cli_path, prompt)

        task = asyncio.create_task(
            asyncio.to_thread(self._stream_sync, args, queue, stdin_text)
        )

        try:
            async with asyncio.timeout(timeout):
                while True:
                    msg = await queue.get()
                    kind, payload = msg
                    if kind == "line":
                        for event in self._parse_line(payload):
                            yield event
                    elif kind == "error":
                        yield CliEvent("error", payload)
                        break
                    elif kind == "done":
                        break
        except asyncio.TimeoutError:
            yield CliEvent("error", f"CLI timed out after {timeout}s")
        except Exception as e:
            logger.exception("run_stream: error")
            yield CliEvent("error", str(e))
        finally:
            if not task.done():
                task.cancel()

    # ── subclasses implement these ───────────────────────────────────────

    def _build_args(self, prompt: str, **kwargs: Any) -> list[str]:
        raise NotImplementedError

    def _build_stream_args(self, prompt: str, **kwargs: Any) -> list[str]:
        raise NotImplementedError

    def _parse_result(self, stdout: bytes, stderr: bytes) -> CliResult:
        raise NotImplementedError

    def _parse_line(self, line: str) -> list[CliEvent]:
        """Parse one line of output into events. Override for JSON formats."""
        return [CliEvent("text", line)]


class ClaudeCodeRunner(BaseCliRunner):
    def _build_args(self, prompt: str, **kwargs: Any) -> list[str]:
        allowed = kwargs.get("allowed_tools", settings.CLAUDE_CODE_ALLOWED_TOOLS)
        budget = kwargs.get("max_budget_usd", settings.CLAUDE_CODE_MAX_BUDGET_USD)
        return [
            "-p", prompt,
            "--output-format", "json",
            "--no-session-persistence",
            "--allowedTools", allowed,
            "--max-budget-usd", str(budget),
            "--permission-mode", "bypassPermissions",
        ]

    def _build_stream_args(self, prompt: str, **kwargs: Any) -> list[str]:
        allowed = kwargs.get("allowed_tools", settings.CLAUDE_CODE_ALLOWED_TOOLS)
        budget = kwargs.get("max_budget_usd", settings.CLAUDE_CODE_MAX_BUDGET_USD)
        return [
            "-p", prompt,
            "--output-format", "stream-json",
            "--verbose",
            "--include-partial-messages",
            "--no-session-persistence",
            "--allowedTools", allowed,
            "--max-budget-usd", str(budget),
            "--permission-mode", "bypassPermissions",
        ]

    def _parse_result(self, stdout: bytes, stderr: bytes) -> CliResult:
        output = stdout.decode("utf-8", errors="replace").strip()
        stderr_text = stderr.decode("utf-8", errors="replace").strip()

        for line in reversed(output.splitlines()):
            line = line.strip()
            if not line:
                continue
            try:
                data = json.loads(line)
                if data.get("type") == "result":
                    is_error = data.get("is_error", False) or data.get("subtype") == "error"
                    usage = data.get("usage", {})
                    return CliResult(
                        success=not is_error,
                        result=data.get("result", ""),
                        usage={
                            "input_tokens": usage.get("input_tokens", 0),
                            "output_tokens": usage.get("output_tokens", 0),
                            "cost_usd": data.get("total_cost_usd"),
                        },
                        duration_ms=data.get("duration_ms"),
                        error=data.get("result") if is_error else None,
                    )
            except json.JSONDecodeError:
                continue

        if output:
            return CliResult(success=True, result=output)
        return CliResult(
            success=False, result="",
            error=stderr_text or "No output from Claude Code",
        )

    def _parse_line(self, line: str) -> list[CliEvent]:
        """Parse one line of stream-json output into events."""
        stripped = line.strip()
        if not stripped:
            return []
        try:
            data = json.loads(stripped)
        except json.JSONDecodeError:
            return [CliEvent("text", stripped)]

        events: list[CliEvent] = []
        event_type = data.get("type", "")

        if event_type == "system":
            events.append(CliEvent("progress", "Initializing...", metadata=data))
        elif event_type == "assistant":
            message = data.get("message", {})
            for part in message.get("content", []):
                if isinstance(part, dict):
                    part_type = part.get("type", "")
                    if part_type == "text":
                        events.append(CliEvent("text", part.get("text", "")))
                    elif part_type == "tool_use":
                        events.append(CliEvent(
                            "progress",
                            f"Tool: {part.get('name', '')}",
                            metadata=part.get("input", {}),
                        ))
                    elif part_type == "thinking":
                        events.append(CliEvent("thinking", part.get("thinking", "")))
                elif isinstance(part, str):
                    events.append(CliEvent("text", part))
        elif event_type == "result":
            events.append(CliEvent("result", data.get("result", ""), metadata={
                "usage": data.get("usage"),
                "cost_usd": data.get("total_cost_usd"),
                "duration_ms": data.get("duration_ms"),
            }))
        elif event_type == "error":
            events.append(CliEvent("error", data.get("message", data.get("error", "Unknown error"))))
        elif event_type == "stream_event":
            inner = data.get("event", {})
            inner_type = inner.get("type", "")
            if inner_type == "content_block_delta":
                delta = inner.get("delta", {})
                if isinstance(delta, dict) and delta.get("type") == "text_delta":
                    events.append(CliEvent("text", delta.get("text", "")))
        else:
            # Unknown type → progress
            message = data.get("message", data.get("text", stripped))
            if isinstance(message, dict):
                message = json.dumps(message)
            events.append(CliEvent("progress", str(message)[:500]))

        return events


class CodexCliRunner(BaseCliRunner):
    _use_stdin = True    # Avoid Windows cmdline encoding corruption for CJK
    _idle_timeout = 30.0  # Codex keeps stdout open after response; allow reasoning time

    def _build_args(self, prompt: str, **kwargs: Any) -> list[str]:
        model = kwargs.get("model", settings.CODEX_CLI_MODEL)
        sandbox = kwargs.get("sandbox", "workspace-write")
        return ["exec", "-", "-m", model, "-s", sandbox]  # "-" reads prompt from stdin

    def _build_stream_args(self, prompt: str, **kwargs: Any) -> list[str]:
        return self._build_args(prompt, **kwargs)

    def _parse_result(self, stdout: bytes, stderr: bytes) -> CliResult:
        output = stdout.decode("utf-8", errors="replace").strip()
        stderr_text = stderr.decode("utf-8", errors="replace").strip()
        if output:
            return CliResult(success=True, result=output)
        return CliResult(success=False, result="", error=stderr_text or "No output from Codex CLI")


# ── Runner factory ──────────────────────────────────────────────────────

_claude_runner: ClaudeCodeRunner | None = None
_codex_runner: CodexCliRunner | None = None


def get_claude_runner() -> ClaudeCodeRunner:
    global _claude_runner
    if _claude_runner is None:
        _claude_runner = ClaudeCodeRunner(
            cli_path=settings.CLAUDE_CODE_CLI_PATH,
            workspace_dir=settings.CLI_DEFAULT_WORKSPACE,
        )
    return _claude_runner


def get_codex_runner() -> CodexCliRunner:
    global _codex_runner
    if _codex_runner is None:
        _codex_runner = CodexCliRunner(
            cli_path=settings.CODEX_CLI_PATH,
            workspace_dir=settings.CLI_DEFAULT_WORKSPACE,
        )
    return _codex_runner
