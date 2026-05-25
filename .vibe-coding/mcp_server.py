"""
Vibe Coding MCP Server — cross-tool workflow for AgentHub development.

Provides tools, resources, and prompts for the daily cycle:
  Plan (vibeCodingPlan/) → Implement → Summary (vibeCodingSummary/)

Supports: Claude Code, Cursor, Continue, Codex — any MCP-compatible tool.
"""

import os
import re
import subprocess
from pathlib import Path
from datetime import date

from mcp.server.fastmcp import FastMCP

# Project root: configurable via env, otherwise cwd
PROJECT_ROOT = Path(os.environ.get("VIBE_CODING_ROOT", os.getcwd()))
PLAN_DIR = PROJECT_ROOT / "vibeCodingPlan"
SUMMARY_DIR = PROJECT_ROOT / "vibeCodingSummary"

mcp = FastMCP("vibe-coding")

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _read_file(path: Path) -> str | None:
    try:
        return path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return None


def _list_md_files(directory: Path) -> list[dict]:
    """List .md files in a directory with name and mtime."""
    if not directory.exists():
        return []
    results = []
    for f in sorted(directory.glob("*.md")):
        stat = f.stat()
        results.append({
            "name": f.name,
            "path": str(f),
            "size": stat.st_size,
            "mtime": stat.st_mtime,
        })
    return results


def _parse_day_info(filename: str) -> dict | None:
    """Extract role, day number, and topic from a plan/summary filename."""
    pattern = r"AgentHub-后端([AB])-Day(\d+)-(.+)\.md"
    m = re.match(pattern, filename)
    if not m:
        return None
    return {
        "role": f"Backend {m.group(1)}",
        "day": int(m.group(2)),
        "topic": m.group(3),
    }


def _git_diff_stat() -> str:
    """Return short git diff stat."""
    try:
        result = subprocess.run(
            ["git", "-C", str(PROJECT_ROOT), "diff", "--stat"],
            capture_output=True, text=True, timeout=10,
            encoding="utf-8", errors="replace",
        )
        return result.stdout.strip() or "(no uncommitted changes)"
    except Exception as e:
        return f"(git unavailable: {e})"


def _git_log_last(n: int = 3) -> str:
    """Return last n git log entries."""
    try:
        result = subprocess.run(
            ["git", "-C", str(PROJECT_ROOT), "log", f"-{n}", "--oneline", "--no-decorate"],
            capture_output=True, text=True, timeout=10,
            encoding="utf-8", errors="replace",
        )
        return result.stdout.strip() or "(no commits)"
    except Exception as e:
        return f"(git unavailable: {e})"


def _load_conventions() -> str:
    """Load project conventions from AGENTS.md."""
    agents_md = _read_file(PROJECT_ROOT / "AGENTS.md")
    if agents_md:
        return agents_md
    return "AGENTS.md not found. Key conventions: camelCase serialization, {code,data,message} wrapper, Page[T] pagination."


# ---------------------------------------------------------------------------
# Tools — executable actions
# ---------------------------------------------------------------------------

@mcp.tool()
def list_plans() -> str:
    """List all vibe coding plans and their completion status.

    Cross-references vibeCodingPlan/ and vibeCodingSummary/ directories
    to show which days have plans written and which have summaries completed.
    Use this at the start of a session to understand current progress.
    """
    plans = _list_md_files(PLAN_DIR)
    summaries = {f["name"] for f in _list_md_files(SUMMARY_DIR)}
    completed = {s.replace(".md", "") for s in summaries}

    if not plans:
        return "No plan files found in vibeCodingPlan/.\n\nCheck the 20-day plan: AgentHub-后端开发20天实施计划.md"

    lines = ["| Status | Role | Day | Topic |", "|--------|------|-----|-------|"]
    for p in plans:
        info = _parse_day_info(p["name"])
        if not info:
            continue
        # Match summary by replacing the md5 hash / variant in name
        plan_stem = p["name"].replace(".md", "")
        status = "[DONE]" if plan_stem in completed else "[IN PROGRESS]"
        lines.append(f"| {status} | {info['role']} | Day {info['day']:02d} | {info['topic']} |")

    if len(lines) == 2:
        return "No valid plans parsed.\n\nRaw files:\n" + "\n".join(p["name"] for p in plans)

    return "\n".join(lines)


@mcp.tool()
def get_plan(identifier: str) -> str:
    """Read a specific vibe coding plan by filename or keyword.

    Args:
        identifier: Filename (e.g. 'AgentHub-后端B-Day03-Mock SSE + ADK Runner 预研.md')
                    or keyword to search (e.g. 'Day03', 'Backend A', 'SSE')
    """
    plans = _list_md_files(PLAN_DIR)

    # Try exact match first
    for p in plans:
        if p["name"] == identifier:
            content = _read_file(Path(p["path"]))
            return f"## {p['name']}\n\n{content}" if content else f"File empty: {p['name']}"

    # Try to find by stem match
    for p in plans:
        if p["name"].replace(".md", "") == identifier:
            content = _read_file(Path(p["path"]))
            return f"## {p['name']}\n\n{content}" if content else f"File empty: {p['name']}"

    # Try keyword search in filenames
    identifier_lower = identifier.lower()
    matches = [p for p in plans if identifier_lower in p["name"].lower()]
    if len(matches) == 1:
        p = matches[0]
        content = _read_file(Path(p["path"]))
        return f"## {p['name']}\n\n{content}" if content else f"File empty: {p['name']}"
    elif len(matches) > 1:
        return f"Multiple plans match '{identifier}':\n" + "\n".join(f"  - {m['name']}" for m in matches)
    else:
        available = "\n".join(f"  - {p['name']}" for p in plans)
        return f"No plan matching '{identifier}' found.\n\nAvailable plans:\n{available or '  (none)'}"


@mcp.tool()
def get_project_context() -> str:
    """Return full project context for new AI coding sessions.

    Includes architecture overview, tech stack, conventions, role split,
    current progress, and recent git activity. Call this at the beginning
    of a new conversation to quickly bootstrap context.
    """
    conventions = _load_conventions()

    # Recent git activity
    git_log = _git_log_last(5)
    git_diff = _git_diff_stat()

    # Current progress
    plans = _list_md_files(PLAN_DIR)
    summaries = {f["name"] for f in _list_md_files(SUMMARY_DIR)}

    progress_lines = []
    for p in plans:
        info = _parse_day_info(p["name"])
        if not info:
            continue
        plan_stem = p["name"].replace(".md", "")
        status = "[DONE]" if plan_stem in summaries else "[IN PROGRESS]"
        progress_lines.append(f"  {status} Day {info['day']:02d} ({info['role']}): {info['topic']}")

    return f"""## Project Context

{conventions}

## Current Progress

{chr(10).join(progress_lines) if progress_lines else '  No plans found'}

## Recent Git Activity

```
{git_log}
```

## Uncommitted Changes

```
{git_diff}
```
"""


@mcp.tool()
def generate_summary_draft(role: str, day_number: int) -> str:
    """Generate a draft summary for today's completed work.

    Collects git diff, recent commits, and plan context to produce
    a structured summary following the project template format.

    Args:
        role: 'A' or 'B' (backend role)
        day_number: Day number in the 20-day plan (e.g. 3)
    """
    role_upper = role.upper()
    topic = ""

    # Try to find the plan to extract topic
    plans = _list_md_files(PLAN_DIR)
    for p in plans:
        info = _parse_day_info(p["name"])
        if info and info["role"] == f"Backend {role_upper}" and info["day"] == day_number:
            topic = info["topic"]
            break

    git_diff = _git_diff_stat()
    git_log = _git_log_last(5)
    today = date.today().isoformat()

    return f"""# AgentHub 后端 {role_upper} - Day {day_number:02d} ({topic or 'TODO: topic'}) 进度总结

> Auto-generated draft — review and fill in details before saving.
> Date: {today}

## 1. 环境变更与基础设施
- **依赖引用**: <!-- 是否新增/升级了 Python 包，虚拟环境是否有变化 -->
- **项目结构**: <!-- 新增了哪些文件，路径和用途 -->

## 2. 当前项目进度与测试结果
- **完成的接口**:
  <!-- List completed endpoints here -->
- **测试结果**:
  <!-- Import checks, lint, API test results -->

## 3. 下一步工作计划与要点分析
- **数据库同步**: <!-- 是否需要生成 migration -->
- **依赖分析与配置补全**: <!-- 环境变量、API Key 等 -->
- **下阶段开发**: <!-- 对应下一日计划的内容 -->

---
## Git Activity (auto-collected)

### Recent Commits
```
{git_log}
```

### Uncommitted Changes
```
{git_diff}
```
"""


# ---------------------------------------------------------------------------
# Resources — static reference data
# ---------------------------------------------------------------------------

@mcp.resource("workflow://rules")
def workflow_rules() -> str:
    """The complete vibe coding workflow specification."""
    content = _read_file(PROJECT_ROOT / ".vibe-coding" / "workflow.md")
    return content or "workflow.md not found"


@mcp.resource("project://architecture")
def project_architecture() -> str:
    """Architecture overview: tech stack, role split, component map."""
    arch = _read_file(PROJECT_ROOT / "AgentHub-架构设计.md")
    if arch:
        # Return first 200 lines — enough for context
        lines = arch.split("\n")
        return "\n".join(lines[:200])
    return "Architecture document not found"


@mcp.resource("project://conventions")
def project_conventions() -> str:
    """Coding conventions extracted from project docs."""
    return _load_conventions()


# ---------------------------------------------------------------------------
# Prompts — reusable prompt templates
# ---------------------------------------------------------------------------

@mcp.prompt()
def start_day(role: str, day_number: int) -> str:
    """Generate a prompt to start a new day of development.

    Args:
        role: 'A' or 'B' (backend role)
        day_number: Day number in the 20-day plan (e.g. 3)
    """
    return f"""You are working on AgentHub as **Backend {role.upper()}**, Day {day_number} of the 20-day plan.

## Before You Start

1. Read `AgentHub-后端开发20天实施计划.md` to understand the day's objectives
2. Read the specific plan file in `vibeCodingPlan/` for Backend {role.upper()} Day {day_number:02d}
3. Check `vibeCodingSummary/` — if a summary already exists for this day, report it and stop

## During Implementation

- Read existing code before modifying it
- Follow ALL project conventions (see AGENTS.md)
- Schema classes inherit `BaseSchema`, not `BaseModel`
- Use `model_dump(exclude_unset=True)` for PATCH endpoints
- camelCase serialization via `alias_generator=to_camel`

## After Implementation

- Verify imports pass
- Check `/docs` for new endpoints
- **DO NOT write a summary yet** — I will ask for it separately

Now begin. First, tell me what Day {day_number} involves for Backend {role.upper()}."""


@mcp.prompt()
def end_day(role: str, day_number: int) -> str:
    """Generate a prompt to end the day and write a summary.

    Args:
        role: 'A' or 'B' (backend role)
        day_number: Day number in the 20-day plan (e.g. 3)
    """
    return f"""We've finished implementing Backend {role.upper()} Day {day_number:02d}.

## Write the Summary

1. Run `git diff --stat` to see what changed
2. Run `git log -3 --oneline` to see recent commits
3. Read the day's plan from `vibeCodingPlan/`
4. Read `.vibe-coding/summary-template.md` for the format
5. Write the summary to `vibeCodingSummary/AgentHub-后端{role.upper()}-Day{day_number:02d}-{{topic}}.md`

The summary MUST include:
- Section 1: Environment changes & dependencies
- Section 2: Progress & test results with specific endpoints
- Section 3: Next steps & risk analysis

When the summary is written, tell me the file path so I can review it."""


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    mcp.run()
