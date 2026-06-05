from __future__ import annotations

import json
import hashlib
from typing import Dict

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.artifact import Artifact


def build_artifact_merge_key(message_id: str, artifact_payload: Dict) -> str:
    artifact_id = artifact_payload.get("id")
    if artifact_id:
        return f"artifact_id:{artifact_id}"

    artifact_type = artifact_payload.get("artifactType") or artifact_payload.get("artifact_type") or "unknown"
    title = artifact_payload.get("title") or ""
    content = artifact_payload.get("content") or {}
    content_str = json.dumps(content, sort_keys=True, ensure_ascii=False)
    content_hash = hashlib.md5(content_str.encode()).hexdigest()[:12]
    return f"fallback:{message_id}:{artifact_type}:{content_hash}"


class ArtifactService:
    @staticmethod
    async def append_version(
        db: AsyncSession,
        conversation_id,
        message_id,
        artifact_payload: Dict,
        event_id: str | None = None,
    ) -> Artifact:
        merge_key = build_artifact_merge_key(str(message_id), artifact_payload)

        if event_id:
            dedup_query = select(Artifact).where(
                Artifact.conversation_id == conversation_id,
                Artifact.message_id == message_id,
                Artifact.content["_eventId"].astext == event_id,
            )
            existing = (await db.execute(dedup_query)).scalar_one_or_none()
            if existing:
                return existing

        for attempt in range(2):
            try:
                content = dict(artifact_payload.get("content") or {})
                content["_mergeKey"] = merge_key
                if event_id:
                    content["_eventId"] = event_id

                version_query = select(func.max(Artifact.version)).where(
                    Artifact.conversation_id == conversation_id,
                    Artifact.message_id == message_id,
                    Artifact.content["_mergeKey"].astext == merge_key,
                )
                current_max = (await db.execute(version_query)).scalar_one()
                next_version = (current_max or 0) + 1

                row = Artifact(
                    conversation_id=conversation_id,
                    message_id=message_id,
                    artifact_type=artifact_payload.get("artifactType") or artifact_payload.get("artifact_type") or "unknown",
                    title=artifact_payload.get("title"),
                    content=content,
                    storage_key=artifact_payload.get("storageKey") or artifact_payload.get("storage_key"),
                    mime_type=artifact_payload.get("mimeType") or artifact_payload.get("mime_type"),
                    version=next_version,
                )
                db.add(row)
                await db.flush()
                return row
            except IntegrityError:
                if attempt == 1:
                    raise
                await db.rollback()

        raise RuntimeError("append_version failed after retry")

    @staticmethod
    async def update_content(
        db: AsyncSession,
        artifact_id,
        new_content: Dict,
    ) -> Artifact:
        """Persist a user edit as a NEW version of an existing artifact.

        Loads the artifact by id, reuses its merge key so the edit lands in
        the same version chain, and appends a fresh row with ``version`` =
        max + 1. Returns the newly created version row. Internal bookkeeping
        keys (``_mergeKey`` / ``_eventId``) are preserved/refreshed so future
        edits keep chaining correctly.
        """
        from uuid import uuid4

        existing = (
            await db.execute(select(Artifact).where(Artifact.id == artifact_id))
        ).scalar_one_or_none()
        if existing is None:
            raise ValueError(f"artifact {artifact_id} not found")

        old_content = dict(existing.content or {})
        merge_key = old_content.get("_mergeKey") or build_artifact_merge_key(
            str(existing.message_id), {"artifactType": existing.artifact_type, "content": old_content}
        )

        # Start from the prior content so untouched fields (language, fileName,
        # url, …) survive; overlay the caller-supplied changes on top.
        merged = {k: v for k, v in old_content.items() if not k.startswith("_")}
        merged.update(new_content or {})
        merged["_mergeKey"] = merge_key
        merged["_eventId"] = str(uuid4())  # new event so it is not deduped

        version_query = select(func.max(Artifact.version)).where(
            Artifact.conversation_id == existing.conversation_id,
            Artifact.message_id == existing.message_id,
            Artifact.content["_mergeKey"].astext == merge_key,
        )
        current_max = (await db.execute(version_query)).scalar_one()
        next_version = (current_max or 0) + 1

        row = Artifact(
            conversation_id=existing.conversation_id,
            message_id=existing.message_id,
            artifact_type=existing.artifact_type,
            title=existing.title,
            content=merged,
            storage_key=existing.storage_key,
            mime_type=existing.mime_type,
            version=next_version,
        )
        db.add(row)
        await db.flush()
        return row
