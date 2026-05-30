import uuid
from types import SimpleNamespace

from app.services.adapters.adk_to_sse import ADKToSSETranslator


def _event(*, custom_metadata=None, artifact_delta=None):
    actions = SimpleNamespace(artifact_delta=artifact_delta) if artifact_delta is not None else None
    return SimpleNamespace(custom_metadata=custom_metadata, actions=actions)


def test_extract_artifact_prefers_custom_metadata_artifact_when_non_empty_dict():
    translator = ADKToSSETranslator()
    event = _event(
        custom_metadata={"artifact": {"id": str(uuid.uuid4()), "name": "custom"}},
        artifact_delta={"id": "from-action", "name": "action"},
    )

    result = translator._extract_artifact(event)

    assert result == event.custom_metadata["artifact"]


def test_extract_artifact_falls_back_when_custom_artifact_is_truthy_non_dict():
    translator = ADKToSSETranslator()
    event = _event(
        custom_metadata={"artifact": "custom-artifact"},
        artifact_delta={"id": "from-action", "name": "action"},
    )

    result = translator._extract_artifact(event)

    assert result == {"id": "from-action", "name": "action"}


def test_extract_artifact_falls_back_to_actions_artifact_delta():
    translator = ADKToSSETranslator()
    event = _event(custom_metadata={}, artifact_delta={"id": "from-action", "name": "action"})

    result = translator._extract_artifact(event)

    assert result == {"id": "from-action", "name": "action"}


def test_extract_artifact_returns_empty_dict_when_missing_everywhere():
    translator = ADKToSSETranslator()
    event = _event(custom_metadata={})

    result = translator._extract_artifact(event)

    assert result == {}
