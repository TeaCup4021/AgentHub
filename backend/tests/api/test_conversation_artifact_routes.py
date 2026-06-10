from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.api.v1 import conversations
from app.schemas.message import ArtifactUpdate


class _FakeExecuteResult:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


class _FakeDB:
    def __init__(self, owner_value=None, artifact=None):
        self.owner_value = owner_value
        self.artifact = artifact
        self.committed = False

    async def execute(self, _query):
        return _FakeExecuteResult(self.owner_value)

    async def get(self, model, item_id):
        assert model is conversations.Artifact
        assert item_id
        return self.artifact

    async def commit(self):
        self.committed = True


def _artifact_row(*, conv_id, artifact_id=None, version=1, code="old"):
    return SimpleNamespace(
        id=artifact_id or uuid4(),
        conversation_id=conv_id,
        artifact_type="code",
        title="src/App.jsx",
        content={
            "fileName": "src/App.jsx",
            "language": "jsx",
            "code": code,
            "_mergeKey": "artifact_id:demo",
        },
        storage_key=None,
        mime_type=None,
        version=version,
        created_at=datetime(2026, 6, 8, tzinfo=timezone.utc),
    )


@pytest.mark.asyncio
async def test_get_artifact_versions_returns_frontend_shape(monkeypatch):
    conv_id = uuid4()
    user_id = uuid4()
    row = _artifact_row(conv_id=conv_id, version=2, code="new")
    db = _FakeDB(owner_value=conv_id)

    async def _get_versions(db, conversation_id, merge_key, page, page_size):
        assert conversation_id == conv_id
        assert merge_key == "artifact_id:demo"
        assert page == 1
        assert page_size == 20
        return [row], 1

    monkeypatch.setattr(conversations.ArtifactService, "get_versions", _get_versions)

    payload = await conversations.get_artifact_versions(
        conv_id=conv_id,
        merge_key="artifact_id:demo",
        page=1,
        page_size=20,
        db=db,
        user_id=user_id,
    )

    assert payload["total"] == 1
    assert payload["pageSize"] == 20
    assert payload["list"][0]["artifactType"] == "code"
    assert payload["list"][0]["content"]["code"] == "new"
    assert payload["list"][0]["version"] == 2


@pytest.mark.asyncio
async def test_get_artifact_versions_requires_conversation_owner():
    with pytest.raises(HTTPException) as exc:
        await conversations.get_artifact_versions(
            conv_id=uuid4(),
            merge_key="artifact_id:demo",
            page=1,
            page_size=20,
            db=_FakeDB(owner_value=None),
            user_id=uuid4(),
        )

    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_update_conversation_artifact_returns_new_version(monkeypatch):
    conv_id = uuid4()
    user_id = uuid4()
    artifact_id = uuid4()
    existing = _artifact_row(conv_id=conv_id, artifact_id=artifact_id, version=1)
    updated = _artifact_row(conv_id=conv_id, artifact_id=uuid4(), version=2, code="new code")
    db = _FakeDB(owner_value=conv_id, artifact=existing)

    async def _update_content(db, artifact_id, new_content):
        assert artifact_id == existing.id
        assert new_content == {"code": "new code"}
        return updated

    monkeypatch.setattr(conversations.ArtifactService, "update_content", _update_content)

    payload = await conversations.update_conversation_artifact(
        conv_id=conv_id,
        artifact_id=artifact_id,
        data=ArtifactUpdate(content={"code": "new code"}),
        db=db,
        user_id=user_id,
    )

    assert db.committed is True
    assert payload["version"] == 2
    assert payload["artifact"]["content"]["code"] == "new code"
    assert payload["artifact"]["artifactType"] == "code"


@pytest.mark.asyncio
async def test_update_conversation_artifact_rejects_cross_conversation_artifact():
    conv_id = uuid4()
    other_conv_id = uuid4()
    artifact_id = uuid4()
    db = _FakeDB(
        owner_value=conv_id,
        artifact=_artifact_row(conv_id=other_conv_id, artifact_id=artifact_id),
    )

    with pytest.raises(HTTPException) as exc:
        await conversations.update_conversation_artifact(
            conv_id=conv_id,
            artifact_id=artifact_id,
            data=ArtifactUpdate(content={"code": "new code"}),
            db=db,
            user_id=uuid4(),
        )

    assert exc.value.status_code == 404
