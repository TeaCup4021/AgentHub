from __future__ import annotations

from app.services.artifact_format import (
    _ARTIFACT_REMINDER,
    _SELECTION_EDIT_MARKER,
    inject_artifact_reminder,
)


def test_inject_reminder_appends_base_reminder():
    out = inject_artifact_reminder("写一个函数")
    assert out.startswith("写一个函数")
    assert _ARTIFACT_REMINDER in out


def test_inject_reminder_noop_on_empty():
    assert inject_artifact_reminder("") == ""


def test_selection_edit_marker_adds_diff_directive():
    prompt = f"{_SELECTION_EDIT_MARKER} 请仅修改以下选中的代码片段：\n\n```python\nx=1\n```\n\n修改要求：改成 x = 2"
    out = inject_artifact_reminder(prompt)
    # base reminder always present
    assert _ARTIFACT_REMINDER in out
    # selection edit gets the extra diff-targeting directive
    assert "selected a specific code snippet" in out
    assert 'type="diff"' in out


def test_plain_prompt_has_no_selection_directive():
    out = inject_artifact_reminder("普通问题，没有选区")
    assert "selected a specific code snippet" not in out
