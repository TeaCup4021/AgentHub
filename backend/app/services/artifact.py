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
    async def get_versions(
        db: AsyncSession,
        conversation_id,
        merge_key: str,
        page: int = 1,
        page_size: int = 20,
    ):
        from sqlalchemy import desc
        count_query = select(func.count()).select_from(Artifact).where(
            Artifact.conversation_id == conversation_id,
            Artifact.content["_mergeKey"].astext == merge_key,
        )
        total = (await db.execute(count_query)).scalar_one()

        query = (
            select(Artifact)
            .where(
                Artifact.conversation_id == conversation_id,
                Artifact.content["_mergeKey"].astext == merge_key,
            )
            .order_by(desc(Artifact.version))
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        result = await db.execute(query)
        return result.scalars().all(), total

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
