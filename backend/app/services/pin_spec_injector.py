import logging
import os
from typing import Optional
from uuid import UUID

from google.genai import types
from sqlalchemy import select

from app.core.database import async_session_maker
from app.models.message import Message
from app.models.message_pin import MessagePin
from app.services.spec_manager import get_spec_manager

logger = logging.getLogger("agenthub.pin_spec_injector")
if os.getenv("AGENTHUB_PIN_INJECTOR_LOG", "0").strip().lower() in {"1", "true", "yes"}:
    log_dir = os.path.join(os.path.dirname(__file__), "..", "..", "logs")
    os.makedirs(log_dir, exist_ok=True)
    log_path = os.path.join(log_dir, "pin_injector.log")
    if not logger.handlers:
        stream_handler = logging.StreamHandler()
        stream_handler.setFormatter(logging.Formatter("%(levelname)s %(name)s %(message)s"))
        file_handler = logging.FileHandler(log_path, encoding="utf-8")
        file_handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
        logger.addHandler(stream_handler)
        logger.addHandler(file_handler)
    logger.setLevel(logging.INFO)
    logger.propagate = False


async def _load_spec_rules(conversation_id: str) -> Optional[str]:
    return get_spec_manager().get_rules_for_conversation(conversation_id)


async def _load_pinned_messages(conversation_id: UUID, limit: Optional[int] = None) -> list[str]:
    if limit is None:
        limit = int(os.getenv("AGENTHUB_MAX_PINNED_CONTEXT", "10"))
    async with async_session_maker() as db:
        result = await db.execute(
            select(Message.content)
            .join(MessagePin, Message.id == MessagePin.message_id)
            .where(MessagePin.conversation_id == conversation_id)
            .order_by(MessagePin.created_at.desc())
            .limit(limit)
        )
    return [row[0] for row in result.all() if row[0]]


def _is_renderable_part(part) -> bool:
    """Whether ADK's Anthropic converter can serialize this Part.

    Mirrors the supported branches of ``_part_to_message_block`` in
    ``google.adk.models.anthropic_llm``. A Part that matches none of them
    triggers ``NotImplementedError`` on the next LLM call when history is
    re-serialized. The common offender is an empty text block (``text=''``)
    that some proxies return alongside a tool_use block.
    """
    if getattr(part, "text", None):  # non-empty text (covers thought+text)
        return True
    if getattr(part, "thought", None) and getattr(part, "thought_signature", None):
        return True  # redacted thinking
    if getattr(part, "function_call", None):
        return True
    if getattr(part, "function_response", None):
        return True
    if getattr(part, "inline_data", None):
        return True  # image / pdf
    if getattr(part, "executable_code", None):
        return True
    if getattr(part, "code_execution_result", None):
        return True
    return False


def _sanitize_request_contents(llm_request) -> int:
    """Drop empty/unsupported Parts from request history in place.

    Anthropic rejects empty content blocks and ADK crashes on empty text
    Parts, so a Content left with zero renderable Parts is dropped entirely.
    Returns the number of Parts removed (for logging).
    """
    contents = getattr(llm_request, "contents", None)
    if not contents:
        return 0

    removed = 0
    cleaned_contents = []
    for content in contents:
        parts = getattr(content, "parts", None) or []
        kept = [p for p in parts if _is_renderable_part(p)]
        removed += len(parts) - len(kept)
        if not kept:
            # Fully empty turn — skip it rather than send an empty block.
            continue
        if len(kept) != len(parts):
            content.parts = kept
        cleaned_contents.append(content)

    if removed:
        llm_request.contents = cleaned_contents
    return removed


def _build_injection_text(pinned_messages: list[str], spec_rules: Optional[str], pinned_limit: int = 10) -> Optional[str]:
    parts: list[str] = []

    if pinned_messages:
        joined = "\n".join(f"- {item}" for item in pinned_messages)
        parts.append(f"=== Pinned Messages (most recent {pinned_limit}) ===\n{joined}")

    if spec_rules:
        parts.append(f"=== Spec / Rules ===\n{spec_rules}")

    if not parts:
        return None

    return "\n\n".join(parts)



async def before_model_callback(callback_context, llm_request):
    # Always strip empty/unsupported Parts first — must run before any early
    # return below, since the crash happens during model invocation regardless
    # of whether we have pinned/spec content to inject.
    try:
        removed = _sanitize_request_contents(llm_request)
        if removed:
            logger.info("pin_spec_injector: stripped %s empty/unsupported part(s)", removed)
    except Exception:
        logger.exception("pin_spec_injector: content sanitize failed")

    raw_state = getattr(callback_context, "state", None)
    if isinstance(raw_state, dict):
        state = raw_state
        state_keys = list(raw_state.keys())
    else:
        state = {}
        state_keys = list(getattr(raw_state, "__dict__", {}).keys()) if raw_state is not None else []

    conversation_id_raw = state.get("conversation_id")
    if not conversation_id_raw:
        session_id = getattr(callback_context, "session_id", None)
        session = getattr(callback_context, "session", None)
        if not session_id and session is not None:
            session_id = getattr(session, "session_id", None) or getattr(session, "id", None)
        logger.info(
            "pin_spec_injector: missing conversation_id in state; session_id=%s state_keys=%s session_type=%s",
            session_id,
            state_keys,
            type(session).__name__ if session is not None else None,
        )
        conversation_id_raw = session_id

    if not conversation_id_raw:
        return None

    try:
        conversation_id = UUID(str(conversation_id_raw))
    except (ValueError, TypeError):
        logger.info("pin_spec_injector: invalid conversation_id=%s", conversation_id_raw)
        return None

    pinned_limit = int(os.getenv("AGENTHUB_MAX_PINNED_CONTEXT", "10"))
    pinned_messages = await _load_pinned_messages(conversation_id, pinned_limit)
    spec_rules = await _load_spec_rules(str(conversation_id))
    logger.info(
        "pin_spec_injector: loaded pinned=%s spec_rules=%s for conversation_id=%s",
        len(pinned_messages),
        bool(spec_rules),
        conversation_id,
    )
    injection_text = _build_injection_text(pinned_messages, spec_rules, pinned_limit)

    if not injection_text:
        logger.info("pin_spec_injector: no injection text for conversation_id=%s", conversation_id)
        return None

    system_text = "Pinned context has highest priority and must be followed.\n" + injection_text
    llm_request.append_instructions([system_text])
    logger.info(
        "pin_spec_injector: injected %s chars for conversation_id=%s",
        len(system_text),
        conversation_id,
    )
    return None
