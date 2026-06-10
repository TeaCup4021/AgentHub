import json

import pytest

from app.services.agent_builder import AgentBuilderError, AgentBuilderService


@pytest.mark.asyncio
async def test_agent_builder_uses_deepseek_json_for_deepseek_agent(monkeypatch):
    async def fake_run_builder_llm(**_kwargs):
        return json.dumps({
            "reply": "我已识别到 DeepSeek 后端助手配置。",
            "agentConfig": {
                "name": "后端助手",
                "provider": "litellm",
                "model": "deepseek-v4-pro",
                "baseUrl": "",
                "apiKey": "",
                "systemPrompt": "你是后端助手",
                "capabilities": ["backend", "code", "agent"],
                "toolConfig": {"tools": [{"type": "builtin", "name": "read_file"}]},
            },
            "builderMeta": {
                "understoodFields": ["provider", "model", "systemPrompt", "capabilities"],
                "missingFields": ["baseUrl", "apiKey"],
                "warnings": [],
                "questions": [],
                "readyToCreate": True,
            },
        }, ensure_ascii=False)

    monkeypatch.setattr(AgentBuilderService, "_run_builder_llm", fake_run_builder_llm)

    draft = await AgentBuilderService.build_draft(
        '模型是deepseek-v4-pro,System Prompt是你是后端助手，能力标签是“backend”"code"“agent”'
    )

    config = draft.agent_config
    assert config["provider"] == "litellm"
    assert config["model"] == "deepseek-v4-pro"
    assert config["systemPrompt"] == "你是后端助手"
    assert config["capabilities"] == ["backend", "code", "agent"]
    assert config["builderMeta"]["missingFields"] == ["baseUrl", "apiKey"]


@pytest.mark.asyncio
async def test_agent_builder_does_not_keep_cli_default_when_switching_to_litellm(monkeypatch):
    previous = {
        "name": "前端代码助手",
        "provider": "codex-cli",
        "model": "cli-default",
        "baseUrl": "",
        "apiKey": "",
        "systemPrompt": "保持中文回复。",
        "capabilities": ["frontend"],
        "toolConfig": {"tools": [{"type": "builtin", "name": "read_file"}]},
    }

    async def fake_run_builder_llm(**_kwargs):
        return json.dumps({
            "reply": "已更新为 DeepSeek Agent。",
            "agentConfig": {
                "provider": "litellm",
                "model": "deepseek-v4-pro",
                "systemPrompt": "你是后端助手",
                "capabilities": ["backend"],
                "toolConfig": {"tools": []},
            },
            "builderMeta": {"missingFields": []},
        }, ensure_ascii=False)

    monkeypatch.setattr(AgentBuilderService, "_run_builder_llm", fake_run_builder_llm)

    draft = await AgentBuilderService.build_draft("改用 deepseek-v4-pro", previous)

    config = draft.agent_config
    assert config["provider"] == "litellm"
    assert config["model"] == "deepseek-v4-pro"
    assert config["model"] != "cli-default"
    assert config["name"] == "后端助手"


@pytest.mark.asyncio
async def test_agent_builder_rejects_invalid_llm_json(monkeypatch):
    async def fake_run_builder_llm(**_kwargs):
        return "我不是 JSON"

    monkeypatch.setattr(AgentBuilderService, "_run_builder_llm", fake_run_builder_llm)

    with pytest.raises(AgentBuilderError):
        await AgentBuilderService.build_draft("创建一个 Agent")
