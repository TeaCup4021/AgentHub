from __future__ import annotations

from app.api.v1.conversations import (
    _build_assignment_instruction,
    _extract_assignment_goal,
    _format_assignment_summary,
)
from app.services.adk.merge_aggregator import MergeAggregator, SubAgentSummary


def test_chinese_assignment_summary_uses_chinese_template():
    stage = {
        "subtask_id": "s1",
        "instruction": "\u89c4\u5212\u4e00\u4e2a\u7b80\u5355\u767b\u5f55\u9875\u9762\u7684\u9700\u6c42\u4e0e\u8bbe\u8ba1\u3002",
        "recommended_capabilities": ["\u89c4\u5212", "\u524d\u7aef"],
        "acceptance_criteria": ["\u8f93\u51fa\u4e2d\u6587\u8bbe\u8ba1\u6587\u6863"],
    }
    instruction = _build_assignment_instruction(stage, agent=None)
    summary = _format_assignment_summary(
        [
            {
                "stage_id": "s1",
                "agent_name": "4.8",
                "instruction": instruction,
                "recommended_capabilities": stage["recommended_capabilities"],
            }
        ],
        "\u7f16\u6392\u5668",
    )

    assert "confirmed the execution assignment" not in summary
    assert summary.startswith("\u7f16\u6392\u5668 \u5df2\u786e\u8ba4\u6267\u884c\u5206\u914d")
    assert "\u9636\u6bb5 s1 -> @4.8" in summary
    assert "\u80fd\u529b\uff1a\u89c4\u5212\u3001\u524d\u7aef" in summary


def test_chinese_assignment_instruction_discourages_english_preamble():
    instruction = _build_assignment_instruction(
        {
            "subtask_id": "s2",
            "instruction": "\u5b9e\u73b0\u767b\u5f55\u9875\u9762\u524d\u7aef\u4ee3\u7801\u3002",
            "recommended_capabilities": ["code", "\u524d\u7aef"],
            "acceptance_criteria": ["\u53ef\u8fd0\u884c"],
        },
        agent=None,
    )

    assert "Stage:" not in instruction
    assert "Goal:" not in instruction
    assert "Work only on this assigned stage" not in instruction
    assert "\u9636\u6bb5\uff1as2" in instruction
    assert "\u6700\u7ec8\u56de\u590d\u5fc5\u987b\u4f7f\u7528\u4e2d\u6587" in instruction
    assert "\u4e0d\u8981\u4f7f\u7528\u82f1\u6587\u5f00\u573a\u767d" in instruction


def test_extract_assignment_goal_supports_chinese_and_english_templates():
    chinese = (
        "\u9636\u6bb5\uff1as1\n\n"
        "\u76ee\u6807\uff1a\u8f93\u51fa\u4e00\u4efd\u767b\u5f55\u9875\u8bbe\u8ba1\u6587\u6863\u3002\n\n"
        "\u63a8\u8350\u80fd\u529b\uff1a\u89c4\u5212"
    )
    english = "Stage: s1\n\nGoal: Produce a login page design.\n\nRecommended capabilities: planning"

    assert _extract_assignment_goal(chinese) == "\u8f93\u51fa\u4e00\u4efd\u767b\u5f55\u9875\u8bbe\u8ba1\u6587\u6863\u3002"
    assert _extract_assignment_goal(english) == "Produce a login page design."


def test_structured_summary_follows_chinese_outputs():
    summary = MergeAggregator._build_summary_text(
        "completed",
        [
            SubAgentSummary(
                agent_name="4.8",
                subtask_id="s1",
                status="success",
                latency_ms=12,
                summary="\u5df2\u5b8c\u6210\u767b\u5f55\u9875\u8bbe\u8ba1\u6587\u6863\u3002",
            )
        ],
        has_conflict=False,
        conflict_detail="",
    )

    assert summary.startswith("## \u6267\u884c\u603b\u7ed3")
    assert "## Execution Summary" not in summary
