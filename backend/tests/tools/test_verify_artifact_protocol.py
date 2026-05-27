from __future__ import annotations

from backend.tools.verify_artifact_protocol import parse_sse_lines, validate_event_payload


def test_validate_required_fields_artifact_ok():
    ok, missing = validate_event_payload(
        "artifact",
        {
            "version": "v1",
            "event_id": "e1",
            "conversation_id": "c1",
            "message_id": "m1",
            "timestamp": "2026-05-26T00:00:00Z",
            "artifact": {"artifactType": "code", "content": {"x": 1}},
        },
    )
    assert ok is True
    assert missing == []


def test_validate_required_fields_artifact_missing_artifact_type():
    ok, missing = validate_event_payload(
        "artifact",
        {
            "version": "v1",
            "event_id": "e1",
            "conversation_id": "c1",
            "message_id": "m1",
            "timestamp": "2026-05-26T00:00:00Z",
            "artifact": {"content": {"x": 1}},
        },
    )
    assert ok is False
    assert "artifact.artifactType" in missing


def test_parse_sse_lines_extracts_events():
    lines = [
        "event: token\n",
        "data: {\"version\":\"v1\",\"event_id\":\"e1\",\"conversation_id\":\"c\",\"message_id\":\"m\",\"timestamp\":\"t\",\"delta\":\"x\"}\n",
        "\n",
    ]
    events = parse_sse_lines(lines)
    assert len(events) == 1
    assert events[0][0] == "token"
    assert events[0][1]["event_id"] == "e1"


def test_parse_sse_lines_handles_crlf_and_multiline_data():
    lines = [
        "event: token\r\n",
        "data: {\"version\":\"v1\",\"event_id\":\"e1\",\r\n",
        "data: \"conversation_id\":\"c\",\"message_id\":\"m\",\"timestamp\":\"t\",\"delta\":\"x\"}\r\n",
        "\r\n",
    ]
    events = parse_sse_lines(lines)
    assert len(events) == 1
    assert events[0][1]["conversation_id"] == "c"
