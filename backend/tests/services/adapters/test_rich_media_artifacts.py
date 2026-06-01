import uuid
import json
import pytest
from types import SimpleNamespace
from datetime import datetime, timezone
from typing import AsyncGenerator

from app.services.adapters.adk_to_sse import ADKToSSETranslator


def create_event(*, custom_metadata=None, artifact_delta=None, author="agent", actions=None):
    if actions is None and artifact_delta is not None:
        actions = SimpleNamespace(artifact_delta=artifact_delta)
    return SimpleNamespace(
        author=author,
        custom_metadata=custom_metadata or {},
        actions=actions or SimpleNamespace(),
        timestamp=datetime.now(timezone.utc).timestamp()
    )


async def async_generator(events: list) -> AsyncGenerator:
    for event in events:
        yield event


@pytest.mark.asyncio
class TestRichMediaArtifactSupport:
    """
    Test suite specifically verifying the support for Rich Media Artifacts 
    (diffs, web previews, files, images, code blocks, etc.) in the SSE translation layer.
    """
    async def process_single_event(self, event) -> dict:
        translator = ADKToSSETranslator()
        # Since _to_artifact handles extraction straight from event
        return translator._to_artifact(event, "test-conv-123", "msg-123")
    
    async def test_code_diff_artifact(self):
        diff_payload = {
            "id": str(uuid.uuid4()),
            "type": "diff",
            "content": {"original": "old code", "modified": "new code"}
        }
        event = create_event(custom_metadata={"artifact": diff_payload})
        result = await self.process_single_event(event)
        
        assert result is not None
        assert result["artifact"]["artifactType"] == "diff"
        assert result["artifact"]["content"] == diff_payload["content"]
        assert result["conversation_id"] == "test-conv-123"

    async def test_web_preview_card_artifact(self):
        preview_payload = {
            "id": str(uuid.uuid4()),
            "artifact_type": "preview",
            "content": {"url": "https://example.com", "title": "Example Preview"}
        }
        event = create_event(artifact_delta=preview_payload)  # Use artifact_delta
        result = await self.process_single_event(event)
        
        assert result is not None
        # Should normalize 'artifact_type' to 'artifactType'
        assert result["artifact"]["artifactType"] == "preview" 
        assert result["artifact"]["content"]["url"] == "https://example.com"

    async def test_file_attachment_artifact(self):
        file_payload = {
            "id": str(uuid.uuid4()),
            "artifactType": "file",
            "content": {"url": "https://cdn.example.com/file.pdf", "size": 1024, "fileName": "file.pdf"}
        }
        event = create_event(custom_metadata={"artifact": file_payload})
        result = await self.process_single_event(event)
        
        assert result is not None
        assert result["artifact"]["artifactType"] == "file"
        assert result["artifact"]["content"]["fileName"] == "file.pdf"

    async def test_deploy_status_card_artifact(self):
        deploy_payload = {
            "id": str(uuid.uuid4()),
            "type": "deploy_status", 
            "content": {"status": "deploying", "progress": 50, "url": "https://env.example.com"}
        }
        event = create_event(custom_metadata={"artifact": deploy_payload})
        result = await self.process_single_event(event)

        assert result is not None
        # Validates normalization from 'type' to 'artifactType'
        assert result["artifact"]["artifactType"] == "deploy_status"
        assert result["artifact"]["content"]["status"] == "deploying"

    async def test_e2e_sse_stream_produces_artifacts(self):
        translator = ADKToSSETranslator()
        
        diff_payload = {"id": "diff-1", "type": "diff"}
        preview_payload = {"id": "prev-1", "type": "preview"}
        
        events = [
            create_event(custom_metadata={"artifact": diff_payload}),
            create_event(custom_metadata={"artifact": preview_payload})
        ]
        
        stream = translator.translate(async_generator(events), "test-conv")
        
        sse_outputs = []
        async for sse in stream:
            sse_outputs.append(sse)

        # SSEs emitted might include message_start depending on payload.
        # Let's filter artifact SSEs
        artifact_sses = [s for s in sse_outputs if s.startswith("event: artifact")]
        assert len(artifact_sses) == 2
        
        # Check first artifact (diff)
        diff_sse = artifact_sses[0]
        data_str = diff_sse.split("data: ")[1].strip()
        data = json.loads(data_str)
        assert data["artifact"]["artifactType"] == "diff"
        assert data["artifact"]["id"] == "diff-1"

        # Check second artifact (preview)
        preview_sse = artifact_sses[1]
        data_str = preview_sse.split("data: ")[1].strip()
        data = json.loads(data_str)
        assert data["artifact"]["artifactType"] == "preview"
        assert data["artifact"]["id"] == "prev-1"

