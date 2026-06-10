#!/usr/bin/env python3
"""Validate AgentHub vibe-graph nodes.

This script intentionally supports a small YAML frontmatter subset used by the
vibe-graph templates. It is not a general YAML parser.
"""

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any


NODE_DIRS = {
    "specs": "spec",
    "plans": "plan",
    "tasks": "task",
    "traces": "trace",
}

ID_PATTERN = re.compile(r"^(SPEC|PLAN|TASK|TRACE)-[A-Z0-9]+(?:-[A-Z0-9]+)*-\d{3}$")

STATUS_BY_TYPE = {
    "spec": {"draft", "accepted", "implemented", "deprecated"},
    "plan": {"draft", "reviewing", "approved", "implemented", "superseded"},
    "task": {"todo", "in_progress", "implemented", "verified", "blocked", "cancelled"},
    "trace": {"draft", "implemented", "verified", "partial"},
}

REQUIRED_COMMON = {"id", "type", "title", "status", "created", "updated"}
REQUIRED_BY_TYPE = {
    "spec": {"acceptance"},
    "plan": {"specs", "review"},
    "task": {"plan", "specs"},
    "trace": {"tasks", "implements"},
}

RELATION_FIELDS = {
    "depends_on",
    "relates_to",
    "plans",
    "tasks",
    "specs",
    "plan",
    "traces",
}

PATH_FIELDS = {
    "source_assets",
    "implements",
    "summaries",
    "contracts",
}


@dataclass
class Node:
    path: Path
    data: dict[str, Any]

    @property
    def node_id(self) -> str:
        return str(self.data.get("id", ""))

    @property
    def node_type(self) -> str:
        return str(self.data.get("type", ""))


def parse_scalar(value: str) -> Any:
    value = value.strip()
    if value in {"[]", ""}:
        return []
    if value == "null":
        return None
    if value == "true":
        return True
    if value == "false":
        return False
    if (value.startswith('"') and value.endswith('"')) or (
        value.startswith("'") and value.endswith("'")
    ):
        return value[1:-1]
    return value


def parse_frontmatter(text: str) -> dict[str, Any] | None:
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        return None

    end = None
    for index, line in enumerate(lines[1:], start=1):
        if line.strip() == "---":
            end = index
            break
    if end is None:
        return None

    data: dict[str, Any] = {}
    current_key: str | None = None
    current_nested_key: str | None = None

    for raw in lines[1:end]:
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue

        if raw.startswith("  - ") and current_key:
            item = parse_scalar(raw[4:])
            current_value = data.setdefault(current_key, [])
            if isinstance(current_value, list):
                current_value.append(item)
            continue

        if raw.startswith("  ") and current_key:
            stripped = raw.strip()
            if ": " in stripped:
                key, value = stripped.split(": ", 1)
                current_value = data.setdefault(current_key, {})
                if isinstance(current_value, dict):
                    current_value[key] = parse_scalar(value)
                    current_nested_key = key
            elif stripped.endswith(":"):
                key = stripped[:-1]
                current_value = data.setdefault(current_key, {})
                if isinstance(current_value, dict):
                    current_value[key] = []
                    current_nested_key = key
            elif stripped.startswith("- ") and current_nested_key:
                current_value = data.setdefault(current_key, {})
                if isinstance(current_value, dict):
                    nested_value = current_value.setdefault(current_nested_key, [])
                    if isinstance(nested_value, list):
                        nested_value.append(parse_scalar(stripped[2:]))
            continue

        if ": " in raw:
            key, value = raw.split(": ", 1)
            data[key] = parse_scalar(value)
            current_key = key
            current_nested_key = None
        elif raw.endswith(":"):
            key = raw[:-1]
            data[key] = []
            current_key = key
            current_nested_key = None

    return data


def iter_node_files(root: Path) -> list[Path]:
    files: list[Path] = []
    for dirname in NODE_DIRS:
        directory = root / dirname
        if directory.exists():
            files.extend(sorted(directory.glob("*.md")))
    return files


def as_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


def looks_like_node_id(value: str) -> bool:
    return bool(ID_PATTERN.match(value))


def validate_node_shape(node: Node, root: Path, id_map: dict[str, Node]) -> list[str]:
    errors: list[str] = []
    rel_path = node.path.relative_to(root)
    data = node.data

    missing_common = sorted(REQUIRED_COMMON - set(data))
    if missing_common:
        errors.append(f"{rel_path}: missing fields {', '.join(missing_common)}")

    node_id = node.node_id
    node_type = node.node_type

    if node_id and not looks_like_node_id(node_id):
        errors.append(f"{rel_path}: invalid id format {node_id!r}")

    expected_type = NODE_DIRS.get(node.path.parent.name)
    if expected_type and node_type != expected_type:
        errors.append(
            f"{rel_path}: type {node_type!r} does not match directory {expected_type!r}"
        )

    if node_id and node.path.stem != node_id:
        errors.append(f"{rel_path}: filename should be {node_id}.md")

    if node_type in REQUIRED_BY_TYPE:
        missing = sorted(REQUIRED_BY_TYPE[node_type] - set(data))
        if missing:
            errors.append(f"{rel_path}: missing {node_type} fields {', '.join(missing)}")

    allowed = STATUS_BY_TYPE.get(node_type)
    status = data.get("status")
    if allowed and status not in allowed:
        errors.append(f"{rel_path}: invalid status {status!r} for type {node_type!r}")

    for field in RELATION_FIELDS:
        for value in as_list(data.get(field)):
            if isinstance(value, str) and looks_like_node_id(value) and value not in id_map:
                errors.append(f"{rel_path}: {field} references missing node {value}")

    for field in PATH_FIELDS:
        for value in as_list(data.get(field)):
            if not isinstance(value, str) or not value:
                continue
            if looks_like_node_id(value):
                continue
            if value in {"TBD", "unknown"} or "..." in value:
                continue
            candidate = (root.parent.parent / value).resolve()
            if not candidate.exists():
                errors.append(f"{rel_path}: {field} path not found: {value}")

    return errors


def validate_graph_semantics(nodes: list[Node], id_map: dict[str, Node], root: Path) -> list[str]:
    errors: list[str] = []

    for node in nodes:
        rel_path = node.path.relative_to(root)
        data = node.data
        node_id = node.node_id
        node_type = node.node_type

        if node_type == "plan":
            for task_id in as_list(data.get("tasks")):
                if not isinstance(task_id, str) or not looks_like_node_id(task_id):
                    continue
                task = id_map.get(task_id)
                if not task:
                    continue
                if task.node_type != "task":
                    errors.append(f"{rel_path}: tasks references non-task node {task_id}")
                    continue
                if task.data.get("plan") != node_id:
                    errors.append(
                        f"{rel_path}: task {task_id} does not link back with plan: {node_id}"
                    )

        if node_type == "spec":
            for plan_id in as_list(data.get("plans")):
                if not isinstance(plan_id, str) or not looks_like_node_id(plan_id):
                    continue
                plan = id_map.get(plan_id)
                if not plan:
                    continue
                if plan.node_type != "plan":
                    errors.append(f"{rel_path}: plans references non-plan node {plan_id}")
                    continue
                if node_id not in as_list(plan.data.get("specs")):
                    errors.append(
                        f"{rel_path}: plan {plan_id} does not link back to spec {node_id}"
                    )

        if node_type == "task":
            plan_id = data.get("plan")
            if isinstance(plan_id, str) and plan_id in id_map:
                plan = id_map[plan_id]
                if plan.node_type != "plan":
                    errors.append(f"{rel_path}: plan references non-plan node {plan_id}")
                elif node_id not in as_list(plan.data.get("tasks")):
                    errors.append(
                        f"{rel_path}: parent plan {plan_id} does not include task {node_id}"
                    )

            traces = [
                trace_id
                for trace_id in as_list(data.get("traces"))
                if isinstance(trace_id, str) and looks_like_node_id(trace_id)
            ]
            if data.get("status") in {"implemented", "verified"} and not traces:
                errors.append(f"{rel_path}: implemented/verified task must reference traces")

            for trace_id in traces:
                trace = id_map.get(trace_id)
                if not trace:
                    continue
                if trace.node_type != "trace":
                    errors.append(f"{rel_path}: traces references non-trace node {trace_id}")
                    continue
                if node_id not in as_list(trace.data.get("tasks")):
                    errors.append(
                        f"{rel_path}: trace {trace_id} does not link back to task {node_id}"
                    )

        if node_type == "trace":
            verification = data.get("verification")
            if not as_list(verification):
                errors.append(f"{rel_path}: trace must record verification")

            implements = [
                item
                for item in as_list(data.get("implements"))
                if isinstance(item, str) and item and item not in {"TBD", "unknown"}
            ]
            if not implements:
                errors.append(f"{rel_path}: trace must record at least one implements path")

            for task_id in as_list(data.get("tasks")):
                if not isinstance(task_id, str) or not looks_like_node_id(task_id):
                    continue
                task = id_map.get(task_id)
                if not task:
                    continue
                if task.node_type != "task":
                    errors.append(f"{rel_path}: tasks references non-task node {task_id}")
                    continue
                if node_id not in as_list(task.data.get("traces")):
                    errors.append(
                        f"{rel_path}: task {task_id} does not link back to trace {node_id}"
                    )

            if data.get("status") in {"verified", "implemented"}:
                summaries = [
                    item
                    for item in as_list(data.get("summaries"))
                    if isinstance(item, str) and item and item not in {"TBD", "unknown"}
                ]
                if not summaries:
                    errors.append(
                        f"{rel_path}: implemented/verified trace should link summaries"
                    )

    return errors


def validate(root: Path) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    nodes: list[Node] = []

    for path in iter_node_files(root):
        text = path.read_text(encoding="utf-8")
        data = parse_frontmatter(text)
        if data is None:
            errors.append(f"{path.relative_to(root)}: missing YAML frontmatter")
            continue
        nodes.append(Node(path=path, data=data))

    id_map: dict[str, Node] = {}
    for node in nodes:
        node_id = node.node_id
        if not node_id:
            continue
        if node_id in id_map:
            errors.append(
                f"{node.path.relative_to(root)}: duplicate id {node_id} also in "
                f"{id_map[node_id].path.relative_to(root)}"
            )
        else:
            id_map[node_id] = node

    for node in nodes:
        errors.extend(validate_node_shape(node, root, id_map))
    errors.extend(validate_graph_semantics(nodes, id_map, root))

    if not nodes:
        warnings.append("No graph node files found under specs/plans/tasks/traces.")

    return errors, warnings


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate docs/vibe-graph nodes.")
    parser.add_argument(
        "root",
        nargs="?",
        default="docs/vibe-graph",
        help="Path to vibe-graph root directory.",
    )
    args = parser.parse_args()

    root = Path(args.root).resolve()
    if not root.exists():
        print(f"ERROR: root does not exist: {root}", file=sys.stderr)
        return 2

    errors, warnings = validate(root)

    for warning in warnings:
        print(f"WARNING: {warning}")
    for error in errors:
        print(f"ERROR: {error}", file=sys.stderr)

    if errors:
        print(f"Validation failed: {len(errors)} error(s), {len(warnings)} warning(s).")
        return 1

    print(f"Validation passed: 0 errors, {len(warnings)} warning(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
