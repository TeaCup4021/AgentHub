from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from google.adk.agents import LlmAgent
from google.adk.planners import BuiltInPlanner
from google.genai import types

from app.services.adk.models import get_deepseek_llm
from app.services.adk.runner import AgentHubRunner

logger = logging.getLogger("agenthub.agent_builder")

BUILTIN_TOOLS = {
    "read_file",
    "create_file",
    "edit_file",
    "execute_command",
    "web_search",
    "upload_file",
    "preview_publish",
}
PROVIDERS = {"anthropic", "litellm", "claude-code-cli", "codex-cli"}
CLI_PROVIDERS = {"claude-code-cli", "codex-cli"}
CLI_DEFAULT_MODEL = "cli-default"
_ADK_TEMPLATE_RE = re.compile(r"\{([a-zA-Z_][a-zA-Z0-9_]*)\??\}")


def _sanitize_for_adk_instruction(text: str) -> str:
    if not text:
        return text
    return _ADK_TEMPLATE_RE.sub(r"(\1)", text)


@dataclass
class AgentBuilderDraft:
    reply: str
    agent_config: dict[str, Any]
    raw_text: str = ""


class AgentBuilderError(ValueError):
    """Raised when the Agent Builder LLM cannot produce a usable draft."""


class AgentBuilderService:
    """Build Agent configuration drafts with the built-in DeepSeek orchestrator.

    Product-wise this role is called "Agent Builder"; technically it reuses the
    same configured DeepSeek LiteLLM backend as the Orchestrator.
    """

    @classmethod
    async def build_draft(
        cls,
        user_message: str,
        previous_config: dict[str, Any] | None = None,
        conversation_id: UUID | str | None = None,
        user_id: UUID | str | None = None,
    ) -> AgentBuilderDraft:
        prompt_text = (user_message or "").strip()
        if not prompt_text:
            raise AgentBuilderError("Agent Builder needs a user request.")

        previous = cls._normalize_config(previous_config) if previous_config else {}
        raw_text = await cls._run_builder_llm(
            user_message=prompt_text,
            previous_config=previous,
            conversation_id=conversation_id,
            user_id=user_id,
        )
        data = cls._parse_llm_json(raw_text)
        config = cls._normalize_config(data.get("agentConfig") or data.get("agent_config") or {})
        config = cls._merge_missing_config(config, previous)
        meta = cls._normalize_meta(data.get("builderMeta") or data.get("builder_meta") or {}, config)
        config["builderMeta"] = meta

        reply = str(data.get("reply") or "").strip()
        if not reply:
            reply = cls._default_reply(config, meta)
        return AgentBuilderDraft(reply=reply, agent_config=config, raw_text=raw_text)

    @classmethod
    async def _run_builder_llm(
        cls,
        user_message: str,
        previous_config: dict[str, Any],
        conversation_id: UUID | str | None,
        user_id: UUID | str | None,
    ) -> str:
        agent = LlmAgent(
            name="agent_builder",
            model=get_deepseek_llm(),
            instruction=cls._build_instruction(previous_config),
            planner=BuiltInPlanner(
                thinking_config=types.ThinkingConfig(thinking_budget=1024)
            ),
        )
        runner = AgentHubRunner(agent=agent, app_name="agenthub_agent_builder")
        session_id = f"agent-builder-{conversation_id or 'draft'}"
        runner_user_id = str(user_id or conversation_id or "agent-builder")
        events = await runner.run_single_turn(
            user_id=runner_user_id,
            session_id=session_id,
            message=user_message,
        )
        raw_text = cls._extract_text(events).strip()
        if not raw_text:
            raise AgentBuilderError("Agent Builder returned an empty response.")
        logger.info("Agent Builder raw response: %.500s", raw_text)
        return raw_text

    @staticmethod
    def _build_instruction(previous_config: dict[str, Any]) -> str:
        previous_json = _sanitize_for_adk_instruction(
            json.dumps(previous_config or {}, ensure_ascii=False, indent=2)
        )
        tools = ", ".join(sorted(BUILTIN_TOOLS))
        providers = ", ".join(sorted(PROVIDERS))
        return (
            "You are Agent Builder in AgentHub. Your job is to understand the "
            "user's natural-language request and produce a draft Agent configuration.\n\n"
            "You are powered by the same DeepSeek model used by the Orchestrator, "
            "but your product role and displayed name are Agent Builder.\n\n"
            "Return ONLY one valid JSON object. Do not wrap it in markdown. Do not "
            "include explanations outside JSON.\n\n"
            "Required output shape:\n"
            "{\n"
            "  \"reply\": \"<short conversational response in the same language as the user>\",\n"
            "  \"agentConfig\": {\n"
            "    \"name\": \"<agent display name>\",\n"
            f"    \"provider\": \"<one of: {providers}>\",\n"
            "    \"model\": \"<exact model name>\",\n"
            "    \"baseUrl\": \"\",\n"
            "    \"apiKey\": \"\",\n"
            "    \"systemPrompt\": \"<exact system prompt for the new agent>\",\n"
            "    \"capabilities\": [\"<tags>\"],\n"
            "    \"toolConfig\": {\n"
            "      \"tools\": [{\"type\": \"builtin\", \"name\": \"read_file\"}]\n"
            "    }\n"
            "  },\n"
            "  \"builderMeta\": {\n"
            "    \"understoodFields\": [\"provider\", \"model\"],\n"
            "    \"missingFields\": [],\n"
            "    \"warnings\": [],\n"
            "    \"questions\": [],\n"
            "    \"readyToCreate\": true\n"
            "  }\n"
            "}\n\n"
            "Rules:\n"
            "1. Explicit user input always wins over the previous draft.\n"
            "2. If the user mentions DeepSeek or a deepseek-* model, provider is normally litellm.\n"
            "3. Preserve exact model names such as deepseek-v4-pro. Do not replace them with cli-default.\n"
            "4. Preserve an explicit System Prompt exactly as the user wrote it, excluding the field label.\n"
            "5. Preserve explicit capability tags such as backend, code, and agent. Do not over-normalize them.\n"
            "6. If switching from a CLI provider to a non-CLI provider, never keep cli-default as the model.\n"
            "7. Do not invent apiKey. Leave it empty unless the user explicitly provides one.\n"
            "8. For litellm/non-CLI agents, missing baseUrl/apiKey should be listed in missingFields, but a draft may still be readyToCreate.\n"
            f"9. Only include builtin tools from this allowlist: {tools}. If unsure, leave tools empty or keep previous tools.\n"
            "10. If no name is provided, infer a concise Chinese or English name from the request language and capabilities.\n\n"
            "Previous draft JSON, used only for conversational refinement:\n"
            f"{previous_json}"
        )

    @staticmethod
    def _extract_text(events: list) -> str:
        texts: list[str] = []
        for event in events:
            content = getattr(event, "content", None)
            if content is None:
                continue
            for part in getattr(content, "parts", None) or []:
                if getattr(part, "thought", False):
                    continue
                text = getattr(part, "text", None)
                if text:
                    texts.append(text)
        return "".join(texts)

    @classmethod
    def _parse_llm_json(cls, raw_text: str) -> dict[str, Any]:
        text = cls._strip_markdown_fence(raw_text.strip())
        decoder = json.JSONDecoder()
        start = text.find("{")
        while start != -1:
            try:
                data, _ = decoder.raw_decode(text, start)
                if isinstance(data, dict):
                    return data
            except json.JSONDecodeError:
                start = text.find("{", start + 1)
                continue
            break
        raise AgentBuilderError("Agent Builder did not return valid JSON.")

    @staticmethod
    def _strip_markdown_fence(text: str) -> str:
        match = re.match(r"^```(?:json)?\s*(.*?)\s*```$", text, flags=re.DOTALL | re.IGNORECASE)
        return match.group(1) if match else text

    @classmethod
    def _normalize_config(cls, raw_config: dict[str, Any]) -> dict[str, Any]:
        config = raw_config if isinstance(raw_config, dict) else {}
        provider = cls._normalize_provider(config.get("provider"))
        model = str(config.get("model") or "").strip()
        if provider in CLI_PROVIDERS:
            model = model or CLI_DEFAULT_MODEL
        elif model == CLI_DEFAULT_MODEL:
            model = ""

        capabilities = cls._normalize_string_list(config.get("capabilities"))
        tool_config = cls._normalize_tool_config(config.get("toolConfig") or config.get("tool_config"))
        base_url = "" if provider in CLI_PROVIDERS else str(config.get("baseUrl") or config.get("base_url") or "").strip()
        api_key = "" if provider in CLI_PROVIDERS else str(config.get("apiKey") or config.get("api_key") or "").strip()

        return {
            "name": str(config.get("name") or "").strip() or cls._infer_name(capabilities),
            "provider": provider,
            "model": model,
            "baseUrl": base_url,
            "apiKey": api_key,
            "systemPrompt": str(config.get("systemPrompt") or config.get("system_prompt") or "").strip(),
            "capabilities": capabilities,
            "toolConfig": tool_config,
        }

    @staticmethod
    def _normalize_provider(value: Any) -> str:
        provider = str(value or "").strip().lower()
        if not provider:
            return ""
        aliases = {
            "claude_code_cli": "claude-code-cli",
            "claude code cli": "claude-code-cli",
            "claude-code": "claude-code-cli",
            "codex_cli": "codex-cli",
            "codex cli": "codex-cli",
            "deepseek": "litellm",
            "openai": "litellm",
            "claude": "anthropic",
            "anthropicllm": "anthropic",
        }
        provider = aliases.get(provider, provider)
        return provider if provider in PROVIDERS else "litellm"

    @staticmethod
    def _normalize_string_list(value: Any) -> list[str]:
        if isinstance(value, str):
            raw_items = re.split(r"[,，、\s]+", value)
        elif isinstance(value, list):
            raw_items = value
        else:
            raw_items = []

        items: list[str] = []
        for item in raw_items:
            tag = str(item or "").strip().strip("\"'“”‘’")
            if tag and tag not in items:
                items.append(tag)
        return items

    @classmethod
    def _normalize_tool_config(cls, value: Any) -> dict[str, Any]:
        raw_tools = value.get("tools") if isinstance(value, dict) else []
        tools: list[dict[str, str]] = []
        if isinstance(raw_tools, list):
            for item in raw_tools:
                if isinstance(item, str):
                    name = item
                    tool_type = "builtin"
                elif isinstance(item, dict):
                    name = str(item.get("name") or "").strip()
                    tool_type = str(item.get("type") or "builtin").strip()
                else:
                    continue
                if tool_type == "builtin" and name in BUILTIN_TOOLS and not any(t["name"] == name for t in tools):
                    tools.append({"type": "builtin", "name": name})
        return {"tools": tools}

    @staticmethod
    def _infer_name(capabilities: list[str]) -> str:
        lowered = {item.lower() for item in capabilities}
        if "backend" in lowered:
            return "后端助手"
        if "frontend" in lowered:
            return "前端助手"
        if "testing" in lowered or "test" in lowered:
            return "测试助手"
        return "自定义 Agent"

    @classmethod
    def _merge_missing_config(
        cls,
        config: dict[str, Any],
        previous: dict[str, Any],
    ) -> dict[str, Any]:
        merged = dict(config)
        if not previous:
            merged["provider"] = merged.get("provider") or "litellm"
            if merged["provider"] in CLI_PROVIDERS:
                merged["model"] = merged.get("model") or CLI_DEFAULT_MODEL
                merged["baseUrl"] = ""
                merged["apiKey"] = ""
            return merged
        for key in ("name", "systemPrompt"):
            if not merged.get(key) and previous.get(key):
                merged[key] = previous[key]

        if not merged.get("capabilities") and previous.get("capabilities"):
            merged["capabilities"] = list(previous["capabilities"])

        if not cls._tool_names(merged) and cls._tool_names(previous):
            merged["toolConfig"] = previous["toolConfig"]

        provider = merged.get("provider") or previous.get("provider") or "litellm"
        merged["provider"] = cls._normalize_provider(provider)
        provider_changed_from_cli = (
            previous.get("provider") in CLI_PROVIDERS
            and merged["provider"] not in CLI_PROVIDERS
        )

        if not merged.get("model") and previous.get("model") and not provider_changed_from_cli:
            merged["model"] = previous["model"]
        if merged["provider"] in CLI_PROVIDERS:
            merged["model"] = merged.get("model") or CLI_DEFAULT_MODEL
            merged["baseUrl"] = ""
            merged["apiKey"] = ""
        elif merged.get("model") == CLI_DEFAULT_MODEL:
            merged["model"] = ""

        for key in ("baseUrl", "apiKey"):
            if not merged.get(key) and previous.get(key) and merged["provider"] not in CLI_PROVIDERS:
                merged[key] = previous[key]
        return merged

    @staticmethod
    def _tool_names(config: dict[str, Any]) -> list[str]:
        raw_tools = (config.get("toolConfig") or {}).get("tools") if isinstance(config.get("toolConfig"), dict) else []
        names: list[str] = []
        if isinstance(raw_tools, list):
            for item in raw_tools:
                if isinstance(item, dict) and item.get("name"):
                    names.append(str(item["name"]))
                elif isinstance(item, str):
                    names.append(item)
        return names

    @classmethod
    def _normalize_meta(cls, raw_meta: dict[str, Any], config: dict[str, Any]) -> dict[str, Any]:
        meta = raw_meta if isinstance(raw_meta, dict) else {}
        understood = cls._normalize_string_list(
            meta.get("understoodFields") or meta.get("understood_fields")
        )
        missing = cls._normalize_string_list(
            meta.get("missingFields") or meta.get("missing_fields")
        )
        warnings = cls._normalize_string_list(meta.get("warnings"))
        questions = cls._normalize_string_list(meta.get("questions"))

        for field in cls._required_missing_fields(config):
            if field not in missing:
                missing.append(field)
        for field in ("name", "provider", "model", "systemPrompt", "capabilities", "toolConfig"):
            value = config.get(field)
            if value and field not in understood:
                understood.append(field)

        ready = bool(meta.get("readyToCreate", meta.get("ready_to_create", True)))
        return {
            "understoodFields": understood,
            "missingFields": missing,
            "warnings": warnings,
            "questions": questions,
            "readyToCreate": ready,
        }

    @staticmethod
    def _required_missing_fields(config: dict[str, Any]) -> list[str]:
        missing: list[str] = []
        if not config.get("name"):
            missing.append("name")
        if not config.get("model"):
            missing.append("model")
        if not config.get("systemPrompt"):
            missing.append("systemPrompt")
        if config.get("provider") not in CLI_PROVIDERS:
            if not config.get("baseUrl"):
                missing.append("baseUrl")
            if not config.get("apiKey"):
                missing.append("apiKey")
        return missing

    @staticmethod
    def _default_reply(config: dict[str, Any], meta: dict[str, Any]) -> str:
        name = config.get("name") or "Agent"
        model = config.get("model") or "未指定模型"
        missing = meta.get("missingFields") or []
        reply = f"我已整理出「{name}」的 Agent 配置草案，模型是 {model}。"
        if missing:
            reply += f" 仍需补充：{', '.join(missing)}。"
        return reply
