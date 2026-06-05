from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

import pytest
from sqlalchemy.exc import IntegrityError

from app.services.artifact import ArtifactService, build_artifact_merge_key


def test_build_merge_key_prefers_artifact_id():
    key = build_artifact_merge_key(
        message_id=str(uuid4()),
        artifact_payload={"id": "art-1", "artifactType": "code", "title": "demo"},
    )
    assert key == "artifact_id:art-1"


def test_build_merge_key_fallback():
    import hashlib
    import json

    mid = str(uuid4())
    # No id → fallback key is fallback:{message_id}:{type}:{md5(content)[:12]}.
    # This payload has no "content", so the hash is over an empty dict.
    content_hash = hashlib.md5(
        json.dumps({}, sort_keys=True, ensure_ascii=False).encode()
    ).hexdigest()[:12]
    key = build_artifact_merge_key(
        message_id=mid,
        artifact_payload={"artifactType": "code", "title": "demo"},
    )
    assert key == f"fallback:{mid}:code:{content_hash}"


class _FakeExecuteResult:
    def __init__(self, value):
        self._value = value

    def scalar_one(self):
        return self._value

    def scalar_one_or_none(self):
        return self._value


class _FakeDB:
    def __init__(self, execute_values: list[object]):
        self.execute_values = list(execute_values)
        self.rows = []
        self.rollback_calls = 0
        self.flush_calls = 0
        self.flush_failures_left = 0

    async def execute(self, _query):
        value = self.execute_values.pop(0) if self.execute_values else None
        return _FakeExecuteResult(value)

    def add(self, row):
        self.rows.append(row)

    async def flush(self):
        self.flush_calls += 1
        if self.flush_failures_left > 0:
            self.flush_failures_left -= 1
            raise IntegrityError("insert", params=None, orig=Exception("dup"))
        return None

    async def rollback(self):
        self.rollback_calls += 1


@pytest.mark.asyncio
async def test_append_version_increments():
    # call order:
    # 1) dedup query for first call -> None
    # 2) max(version) query first call -> None => version 1
    # 3) dedup query second call -> None
    # 4) max(version) query second call -> 1 => version 2
    db = _FakeDB([None, None, None, 1])
    conversation_id = uuid4()
    message_id = uuid4()

    first = await ArtifactService.append_version(
        db=db,
        conversation_id=conversation_id,
        message_id=message_id,
        artifact_payload={
            "id": "art-2",
            "artifactType": "code",
            "title": "x",
            "content": {"delta": "1"},
            "storageKey": "s1",
            "mimeType": "application/json",
        },
        event_id="e1",
    )

    second = await ArtifactService.append_version(
        db=db,
        conversation_id=conversation_id,
        message_id=message_id,
        artifact_payload={
            "id": "art-2",
            "artifactType": "code",
            "title": "x",
            "content": {"delta": "2"},
            "storageKey": "s2",
            "mimeType": "application/json",
        },
        event_id="e2",
    )

    assert first.version == 1
    assert second.version == 2
    assert first.content["_mergeKey"] == "artifact_id:art-2"
    assert second.content["_mergeKey"] == "artifact_id:art-2"
    assert first.content["_eventId"] == "e1"
    assert second.content["_eventId"] == "e2"
    assert first.storage_key == "s1"
    assert second.storage_key == "s2"


@pytest.mark.asyncio
async def test_append_version_dedup_by_event_id():
    existing = SimpleNamespace(id="existing-id", version=1)
    # first execute is dedup query -> existing
    db = _FakeDB([existing])

    row = await ArtifactService.append_version(
        db=db,
        conversation_id=uuid4(),
        message_id=uuid4(),
        artifact_payload={"id": "art-9", "artifactType": "code", "title": "dup", "content": {"v": 1}},
        event_id="evt-1",
    )

    assert row is existing


@pytest.mark.asyncio
async def test_append_version_retries_once_on_integrity_error():
    # call order:
    # 1) dedup query -> None
    # 2) max(version) query first attempt -> None
    # 3) max(version) query retry attempt -> None
    db = _FakeDB([None, None, None])
    db.flush_failures_left = 1

    row = await ArtifactService.append_version(
        db=db,
        conversation_id=uuid4(),
        message_id=uuid4(),
        artifact_payload={"id": "art-10", "artifactType": "code", "title": "retry", "content": {"v": 1}},
        event_id="evt-2",
    )

    assert row.version == 1
    assert db.rollback_calls == 1
    assert db.flush_calls == 2


@pytest.mark.asyncio
async def test_update_content_appends_new_version_and_preserves_fields():
    conv_id = uuid4()
    msg_id = uuid4()
    existing = SimpleNamespace(
        id="art-edit",
        conversation_id=conv_id,
        message_id=msg_id,
        artifact_type="code",
        title="demo",
        content={"language": "python", "fileName": "x.py", "code": "old", "_mergeKey": "artifact_id:art-edit", "_eventId": "e0"},
        storage_key="sk",
        mime_type="text/x-python",
        version=1,
    )
    # call order: 1) load by id -> existing, 2) max(version) query -> 1
    db = _FakeDB([existing, 1])

    row = await ArtifactService.update_content(
        db=db,
        artifact_id="art-edit",
        new_content={"code": "new code"},
    )

    assert row.version == 2
    assert row.content["code"] == "new code"
    # untouched fields survive
    assert row.content["language"] == "python"
    assert row.content["fileName"] == "x.py"
    # merge key chains to the same version line; event id is refreshed
    assert row.content["_mergeKey"] == "artifact_id:art-edit"
    assert row.content["_eventId"] != "e0"
    # inherited metadata
    assert row.conversation_id == conv_id
    assert row.message_id == msg_id
    assert row.artifact_type == "code"
    assert row.storage_key == "sk"


@pytest.mark.asyncio
async def test_update_content_missing_artifact_raises():
    db = _FakeDB([None])  # load by id -> None
    with pytest.raises(ValueError):
        await ArtifactService.update_content(
            db=db,
            artifact_id="nope",
            new_content={"code": "x"},
        )
