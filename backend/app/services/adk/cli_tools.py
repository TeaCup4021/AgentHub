"""Builtin tool registrations for Claude Code and Codex CLIs.

Importing this module triggers ``@register_builtin`` decorations,
making ``claude_code`` and ``codex_cli`` available as ADK FunctionTools.
"""

from __future__ import annotations

from app.core.config import settings
from app.services.adk.cli_runner import get_claude_runner, get_codex_runner
from app.services.adk.tool_loader import register_builtin


@register_builtin("claude_code")
async def claude_code_tool(
    prompt: str,
    workspace_dir: str = "",
    allowed_tools: str = "",
    max_budget_usd: float = 0.0,
) -> dict:
    """Execute a software engineering task using Claude Code CLI.

    Claude Code is a local AI coding agent with full filesystem access.
    It can read/write files, run terminal commands, search code, manage git,
    and perform complex multi-step engineering workflows autonomously.

    Use this tool for tasks that require:
    - Writing or editing code files
    - Running build/test/lint commands
    - Searching across the codebase
    - Git operations (diff, commit, branch)
    - Multi-file refactoring
    - Debugging with actual execution feedback

    Args:
        prompt: Detailed task description. Include file paths, expected
            behavior, edge cases, and any constraints.
        workspace_dir: Project root directory (default: configured workspace).
        allowed_tools: Comma-separated tools to enable
            (default: Bash,Read,Edit,Write,Glob,Grep).
        max_budget_usd: Maximum API cost budget (default: 5.0).

    Returns:
        dict with keys: success, result, usage, duration_ms, error.
    """
    runner = get_claude_runner()
    if workspace_dir:
        runner._workspace_dir = workspace_dir
    if not allowed_tools:
        allowed_tools = settings.CLAUDE_CODE_ALLOWED_TOOLS
    if max_budget_usd <= 0:
        max_budget_usd = settings.CLAUDE_CODE_MAX_BUDGET_USD

    result = await runner.run(
        prompt=prompt,
        timeout=settings.CLAUDE_CODE_TIMEOUT_SECONDS,
        allowed_tools=allowed_tools,
        max_budget_usd=max_budget_usd,
    )
    return {
        "success": result.success,
        "result": result.result,
        "usage": result.usage,
        "duration_ms": result.duration_ms,
        "error": result.error,
    }


@register_builtin("codex_cli")
async def codex_cli_tool(
    prompt: str,
    model: str = "",
    workspace_dir: str = "",
) -> dict:
    """Execute a coding task using Codex CLI (OpenAI's local coding agent).

    Codex CLI is a terminal-based AI agent that can understand and modify
    codebases. It excels at code generation, refactoring, review, and
    repository-level understanding.

    Use this tool for tasks that require:
    - Code generation from specifications
    - Refactoring across multiple files
    - Code review and analysis
    - Understanding complex codebases
    - Automated PR reviews

    Args:
        prompt: Detailed task description.
        model: OpenAI model to use (default: gpt-5).
        workspace_dir: Project root directory (default: configured workspace).

    Returns:
        dict with keys: success, result, duration_ms, error.
    """
    runner = get_codex_runner()
    if workspace_dir:
        runner._workspace_dir = workspace_dir
    if not model:
        model = settings.CODEX_CLI_MODEL

    result = await runner.run(
        prompt=prompt,
        timeout=settings.CODEX_CLI_TIMEOUT_SECONDS,
        model=model,
    )
    return {
        "success": result.success,
        "result": result.result,
        "duration_ms": result.duration_ms,
        "error": result.error,
    }
