from uuid import UUID
from datetime import datetime, timezone
from typing import Optional, List, Dict
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException

from app.models.message import Message
from app.models.message_mention import MessageMention
from app.models.artifact import Artifact
from app.models.user import User
from app.models.agent import Agent
from app.models.conversation import Conversation
from app.schemas.message import MessageCreate, MessageListResponse


class MessageService:

    @staticmethod
    async def persist_stream_message(
        db: AsyncSession,
        conv_id: UUID,
        message_id: str,
        sender_name: str,
        content: str,
        status: str = "done",
    ) -> Optional[Message]:
        try:
            msg_id = UUID(message_id)
        except ValueError:
            import uuid as _uuid
            msg_id = _uuid.uuid4()
        existing = await db.get(Message, msg_id)
        if existing:
            return existing
        msg = Message(
            id=msg_id,
            conversation_id=conv_id,
            sender_type="agent",
            sender_id=None,
            content_type="text",
            content=content,
            status=status,
            meta_data={"agent_name": sender_name},
        )
        db.add(msg)
        await db.flush()
        return msg

    @staticmethod
    async def create_message(
        db: AsyncSession,
        conv_id: UUID,
        user_id: UUID,
        data: MessageCreate,
    ) -> dict:
        # verify conversation exists and belongs to user
        conv = await db.get(Conversation, conv_id)
        if not conv or conv.owner_id != user_id:
            raise HTTPException(status_code=404, detail="Conversation not found")

        if not data.content.strip():
            raise HTTPException(status_code=400, detail="content is required")

        now = datetime.now(timezone.utc)
        msg = Message(
            conversation_id=conv_id,
            sender_type="user",
            sender_id=user_id,
            parent_message_id=data.parent_message_id,
            content_type=data.content_type,
            content=data.content,
            status="done",
            meta_data=None,
        )
        # override server_default so created_at matches for mentions
        msg.created_at = now
        msg.updated_at = now

        db.add(msg)
        await db.flush()

        # insert mentions
        for agent_id in data.mentions:
            db.add(MessageMention(
                message_id=msg.id,
                agent_id=agent_id,
                created_at=now,
            ))

        # bump conversation last_active_at
        conv.last_active_at = now
        db.add(conv)

        await db.commit()
        await db.refresh(msg)

        sender_name = await MessageService._get_sender_name(db, msg.sender_type, msg.sender_id)
        return MessageService._format_message(msg, sender_name, artifacts=[])

    @staticmethod
    async def list_messages(
        db: AsyncSession,
        conv_id: UUID,
        user_id: UUID,
        cursor: Optional[str] = None,
        limit: int = 50,
        sender_type: Optional[str] = None,
        sender_id: Optional[UUID] = None,
    ) -> MessageListResponse:
        # verify conversation exists and belongs to user
        conv = await db.get(Conversation, conv_id)
        if not conv or conv.owner_id != user_id:
            raise HTTPException(status_code=404, detail="Conversation not found")

        query = select(Message).where(Message.conversation_id == conv_id)

        if sender_type:
            query = query.where(Message.sender_type == sender_type)
        if sender_id:
            query = query.where(Message.sender_id == sender_id)

        if cursor:
            try:
                cursor_dt = datetime.fromisoformat(cursor)
            except (ValueError, TypeError):
                raise HTTPException(status_code=400, detail="Invalid cursor format")
            query = query.where(Message.created_at < cursor_dt)

        query = query.order_by(Message.created_at.desc()).limit(limit + 1)

        result = await db.execute(query)
        messages = list(result.scalars().all())

        has_more = len(messages) > limit
        if has_more:
            messages = messages[:limit]

        if not messages:
            return MessageListResponse(items=[], next_cursor=None, has_more=False)

        # batch-fetch artifacts for all messages
        msg_ids = [m.id for m in messages]
        art_query = select(Artifact).where(Artifact.message_id.in_(msg_ids))
        art_result = await db.execute(art_query)
        artifacts = list(art_result.scalars().all())

        # Collapse version chains: an edit (or re-stream) appends a new row with
        # the same _mergeKey, so keep only the latest version per chain to avoid
        # rendering the same card multiple times. Rows without a _mergeKey stand
        # alone (keyed by their own id).
        latest_by_chain: Dict[tuple, Artifact] = {}
        for a in artifacts:
            content = a.content if isinstance(a.content, dict) else {}
            chain_key = (a.message_id, content.get("_mergeKey") or str(a.id))
            current = latest_by_chain.get(chain_key)
            if current is None or (a.version or 0) > (current.version or 0):
                latest_by_chain[chain_key] = a

        art_map: Dict[UUID, list] = {mid: [] for mid in msg_ids}
        for a in latest_by_chain.values():
            art_map[a.message_id].append({
                "id": a.id,
                "artifact_type": a.artifact_type,
                "title": a.title,
                "content": a.content,
                "storage_key": a.storage_key,
                "mime_type": a.mime_type,
                "version": a.version,
                "created_at": a.created_at,
            })

        # build meta_data fallback map for agent messages without a DB agent
        meta_fallbacks: Dict[tuple, str] = {}
        for m in messages:
            if m.sender_type == "agent" and m.meta_data and isinstance(m.meta_data, dict):
                name = m.meta_data.get("agent_name")
                if name:
                    meta_fallbacks[(m.sender_type, m.sender_id)] = name

        # batch-check pinned message ids
        pinned_ids: set = set()
        from app.models.message_pin import MessagePin as Mpin
        pin_q = select(Mpin.message_id).where(Mpin.message_id.in_(msg_ids))
        pin_r = await db.execute(pin_q)
        pinned_ids = {row[0] for row in pin_r.all()}

        # batch-resolve sender_names
        sender_names = await MessageService._batch_get_sender_names(
            db, [(m.sender_type, m.sender_id) for m in messages], meta_fallbacks
        )

        items = [
            MessageService._format_message(m, sender_names.get((m.sender_type, m.sender_id), "Unknown"), art_map.get(m.id, []), is_pinned=m.id in pinned_ids)
            for m in messages
        ]

        next_cursor = messages[-1].created_at.isoformat() if items else None
        return MessageListResponse(items=items, next_cursor=next_cursor, has_more=has_more)

    @staticmethod
    def _format_message(msg: Message, sender_name: str, artifacts: list, is_pinned: bool = False) -> dict:
        return {
            "id": msg.id,
            "conversation_id": msg.conversation_id,
            "sender_type": msg.sender_type,
            "sender_id": msg.sender_id,
            "sender_name": sender_name,
            "parent_message_id": msg.parent_message_id,
            "content_type": msg.content_type,
            "content": msg.content,
            "status": msg.status,
            "meta": msg.meta_data,
            "artifacts": artifacts,
            "is_pinned": is_pinned,
            "created_at": msg.created_at,
            "updated_at": msg.updated_at,
        }

    @staticmethod
    async def _get_sender_name(db: AsyncSession, sender_type: str, sender_id: Optional[UUID]) -> str:
        if sender_type == "user" and sender_id:
            user = await db.get(User, sender_id)
            return user.name if user else "Unknown User"
        elif sender_type == "agent" and sender_id:
            agent = await db.get(Agent, sender_id)
            return agent.name if agent else "Unknown Agent"
        elif sender_type == "orchestrator":
            return "Orchestrator"
        elif sender_type == "system":
            return "System"
        return "Unknown"

    @staticmethod
    async def _batch_get_sender_names(
        db: AsyncSession, senders: List[tuple], meta_fallbacks: Dict[tuple, str] = None
    ) -> Dict[tuple, str]:
        if meta_fallbacks is None:
            meta_fallbacks = {}
        user_ids = []
        agent_ids = []
        for stype, sid in senders:
            if stype == "user" and sid:
                user_ids.append(sid)
            elif stype == "agent" and sid:
                agent_ids.append(sid)

        name_map: Dict[tuple, str] = {}

        if user_ids:
            uq = select(User).where(User.id.in_(list(set(user_ids))))
            ur = await db.execute(uq)
            for u in ur.scalars().all():
                name_map[("user", u.id)] = u.name

        if agent_ids:
            aq = select(Agent).where(Agent.id.in_(list(set(agent_ids))))
            ar = await db.execute(aq)
            for a in ar.scalars().all():
                name_map[("agent", a.id)] = a.name

        # fill in static names
        for stype, sid in set(senders):
            key = (stype, sid)
            if key not in name_map:
                if stype == "orchestrator":
                    name_map[key] = "Orchestrator"
                elif stype == "system":
                    name_map[key] = "System"

        # apply meta_data fallbacks for remaining unknown agent names
        for key, fallback_name in meta_fallbacks.items():
            if key not in name_map:
                name_map[key] = fallback_name

        return name_map
