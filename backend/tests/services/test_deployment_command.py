from __future__ import annotations

from uuid import uuid4

import pytest
from fastapi.responses import StreamingResponse

from app.api.v1.conversations import stream_conversation
from app.services.deployment_command import (
    parse_deploy_command,
    should_handle_deployment_command,
)


def test_parse_deploy_command_supports_chinese_short_commands():
    assert parse_deploy_command("\u90e8\u7f72") == "preview"
    assert parse_deploy_command("\u90e8\u7f72\u547d\u4ee4") == "preview"
    assert parse_deploy_command("\u9884\u89c8\u4e00\u4e0b") == "preview"
    assert parse_deploy_command("\u751f\u6210\u9884\u89c8\u94fe\u63a5") == "preview"
    assert parse_deploy_command("\u5bb9\u5668\u90e8\u7f72") == "container"
    assert parse_deploy_command("\u6253\u5305\u6e90\u7801") == "source_package"
    assert parse_deploy_command("\u9759\u6001\u90e8\u7f72") == "static_site"


def test_parse_deploy_command_ignores_generation_requests_and_negations():
    assert parse_deploy_command("\u5e2e\u6211\u505a\u4e00\u4e2a\u7b80\u5355\u767b\u5f55\u9875\uff0c\u5b9e\u73b0\u524d\u7aef\u4ee3\u7801\uff0c\u5e76\u6700\u540e\u505a\u4e00\u6b21\u68c0\u67e5\u3002") is None
    assert parse_deploy_command("\u4e0d\u8981\u90e8\u7f72\uff0c\u53ea\u68c0\u67e5\u4ee3\u7801") is None
    assert parse_deploy_command("\u5982\u4f55\u90e8\u7f72\u8fd9\u4e2a\u9879\u76ee") is None


def test_parse_deploy_command_ignores_web_preview_artifact_requests():
    assert parse_deploy_command("\u5e2e\u6211\u52a0\u8f7d\u4e00\u4e2a\u53ef\u4ee5\u5d4c\u5165\u7684\u7f51\u9875\u9884\u89c8\uff0c\u6bd4\u5982\u4ecb\u7ecd\u5b57\u8282\u8df3\u52a8\u5b98\u7f51\u3002") is None
    assert parse_deploy_command("\u7f51\u9875\u9884\u89c8\u6d4b\u8bd5") is None
    assert parse_deploy_command("\u751f\u6210\u4e00\u4e2a\u5b57\u8282\u8df3\u52a8\u5b98\u7f51\u4ecb\u7ecd\u7684\u9884\u89c8\u5361\u7247") is None


def test_deployment_command_bypasses_auto_orchestrate_planning():
    assert should_handle_deployment_command(None) is True
    assert should_handle_deployment_command("direct") is True
    assert should_handle_deployment_command("auto_orchestrate") is True
    assert should_handle_deployment_command("refine_plan") is False
    assert should_handle_deployment_command("confirm_plan") is False


@pytest.mark.asyncio
async def test_group_stream_routes_chinese_deploy_to_deployment_card_without_db():
    response = await stream_conversation(
        conv_id=uuid4(),
        user_id=uuid4(),
        prompt="\u90e8\u7f72",
        db=None,
        orchestrate_mode="auto_orchestrate",
    )

    assert isinstance(response, StreamingResponse)
