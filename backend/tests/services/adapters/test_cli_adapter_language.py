from __future__ import annotations

from app.services.adapters.cli_adapter import _strip_chinese_task_english_preamble


def test_strip_chinese_task_english_preamble_removes_first_line_only():
    task = "\u9636\u6bb5\uff1as1\n\n\u76ee\u6807\uff1a\u8f93\u51fa\u767b\u5f55\u9875\u8bbe\u8ba1\u6587\u6863\u3002"
    output = (
        "Let me start by looking at the project structure, then produce the design document."
        "\u597d\u7684\uff0c\u6211\u6765\u5b8c\u6210\u4ee5\u4e0b\u5de5\u4f5c\uff1a\n"
        "\u8bbe\u8ba1\u6587\u6863"
    )

    cleaned = _strip_chinese_task_english_preamble(task, output)

    assert "Let me start" not in cleaned
    assert cleaned.startswith("\u597d\u7684\uff0c\u6211\u6765\u5b8c\u6210")
    assert "\u8bbe\u8ba1\u6587\u6863" in cleaned


def test_strip_chinese_task_english_preamble_keeps_english_tasks():
    task = "Stage: s1\n\nGoal: Produce a login page design document."
    output = "Let me start by checking the project.\nDesign document"

    assert _strip_chinese_task_english_preamble(task, output) == output


def test_strip_chinese_task_english_preamble_keeps_non_preamble():
    task = "\u76ee\u6807\uff1a\u8f93\u51fa\u4e2d\u6587\u6587\u6863"
    output = "# Login Page\nThis section intentionally uses English as content."

    assert _strip_chinese_task_english_preamble(task, output) == output
