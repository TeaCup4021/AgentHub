from __future__ import annotations

import argparse
import json
from collections import Counter
from typing import Any, Dict, Iterable, Tuple

REQUIRED_TOP_LEVEL = ["version", "event_id", "conversation_id", "message_id", "timestamp"]
EVENT_TYPES = ["message_start", "token", "artifact", "agent_status", "message_end", "error"]


def validate_event_payload(event_name: str, payload: Dict[str, Any]) -> Tuple[bool, list[str]]:
    missing = [k for k in REQUIRED_TOP_LEVEL if k not in payload]

    if event_name == "artifact":
        artifact = payload.get("artifact") if isinstance(payload, dict) else None
        if not isinstance(artifact, dict):
            missing.append("artifact")
        elif "artifactType" not in artifact:
            missing.append("artifact.artifactType")

    return (len(missing) == 0, missing)


def parse_sse_lines(lines: Iterable[str]) -> list[tuple[str, Dict[str, Any]]]:
    events: list[tuple[str, Dict[str, Any]]] = []
    current_event = None
    data_lines: list[str] = []

    def _flush_current() -> None:
        nonlocal current_event, data_lines
        if current_event and data_lines:
            try:
                payload = json.loads("\n".join(data_lines))
                if isinstance(payload, dict):
                    events.append((current_event, payload))
            except json.JSONDecodeError:
                pass
        current_event = None
        data_lines = []

    for raw in lines:
        line = raw.rstrip("\r\n")
        if not line:
            _flush_current()
            continue

        if line.startswith("event: "):
            current_event = line[len("event: "):].strip()
        elif line.startswith("data: "):
            data_lines.append(line[len("data: "):])

    _flush_current()
    return events


def _mock_events(provider: str) -> list[tuple[str, Dict[str, Any]]]:
    base = {
        "version": "v1",
        "event_id": f"{provider}-e1",
        "conversation_id": "conv-1",
        "message_id": "msg-1",
        "timestamp": "2026-05-26T00:00:00Z",
    }
    return [
        ("message_start", {**base, "sender": {"type": "agent", "id": provider, "name": provider}}),
        ("token", {**base, "event_id": f"{provider}-e2", "delta": "hello", "index": 1}),
        (
            "artifact",
            {
                **base,
                "event_id": f"{provider}-e3",
                "artifact": {"id": "a1", "artifactType": "code", "content": {"x": 1}},
            },
        ),
        (
            "agent_status",
            {
                **base,
                "event_id": f"{provider}-e4",
                "subtask_id": "s1",
                "agent": {"id": provider, "name": provider},
                "status": "running",
                "progress": 10,
            },
        ),
        (
            "message_end",
            {
                **base,
                "event_id": f"{provider}-e5",
                "finish_reason": "completed",
                "usage": {"input_tokens": 1, "output_tokens": 1},
            },
        ),
        (
            "error",
            {
                **base,
                "event_id": f"{provider}-e6",
                "code": "NONE",
                "message": "no-op",
                "retryable": False,
            },
        ),
    ]


def evaluate_events(events: list[tuple[str, Dict[str, Any]]]) -> Dict[str, Any]:
    counts = Counter(event for event, _ in events)
    coverage = {name: counts.get(name, 0) for name in EVENT_TYPES}

    failures = []
    for event_name, payload in events:
        ok, missing = validate_event_payload(event_name, payload)
        if not ok:
            failures.append({"event": event_name, "missing": missing, "payload": payload})

    return {
        "coverage": coverage,
        "field_ok": len(failures) == 0,
        "failures": failures,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Verify ADK artifact protocol consistency.")
    parser.add_argument("--provider", choices=["anthropic", "litellm"], required=True)
    parser.add_argument("--mode", choices=["mock"], default="mock")
    parser.add_argument("--input", help="Optional SSE text file to evaluate instead of built-in mock.")
    args = parser.parse_args()

    if args.input:
        with open(args.input, "r", encoding="utf-8") as f:
            events = parse_sse_lines(f.readlines())
    else:
        events = _mock_events(args.provider)

    result = evaluate_events(events)
    print(f"PROVIDER: {args.provider}")
    print("EVENT_COVERAGE:", json.dumps(result["coverage"], ensure_ascii=False))
    print("REQUIRED_FIELDS:", "PASS" if result["field_ok"] else "FAIL")
    print("PROTOCOL_CONSISTENCY:", "PASS" if result["field_ok"] else "FAIL")
    if result["failures"]:
        print("FAILURES:", json.dumps(result["failures"], ensure_ascii=False))


if __name__ == "__main__":
    main()
