from uuid import UUID
from datetime import datetime, timezone
from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete, func, desc, or_
from app.models.conversation import Conversation
from app.models.conversation_participant import ConversationParticipant
from app.models.message import Message
from app.models.message_mention import MessageMention
from app.models.message_pin import MessagePin
from app.models.artifact import Artifact
from app.models.orchestrator_task import OrchestratorTask
from app.models.orchestrator_subtask import OrchestratorSubtask
from app.schemas.conversation import ConversationCreate, ConversationUpdate
from app.schemas.base import Page
from fastapi import HTTPException

class ConversationService:
    @staticmethod
    async def list_conversations(
        db: AsyncSession, 
        user_id: UUID,
        page: int = 1, 
        page_size: int = 10, 
        keyword: Optional[str] = None
    ) -> Page:
        query = select(Conversation).where(Conversation.owner_id == user_id)
        
        if keyword:
            query = query.where(Conversation.title.ilike(f"%{keyword}%"))
            
        # Total count
        count_query = select(func.count()).select_from(query.subquery())
        total_result = await db.execute(count_query)
        total = total_result.scalar_one_or_none() or 0
        
        # Pagination & Sorting (is_pinned desc, last_active_at desc)
        query = query.order_by(desc(Conversation.is_pinned), desc(Conversation.last_active_at))
        query = query.offset((page - 1) * page_size).limit(page_size)
        
        result = await db.execute(query)
        conversations = result.scalars().all()
        
        items = []
        if conversations:
            conv_ids = [c.id for c in conversations]
            # Fetch agents
            participant_query = select(ConversationParticipant).where(
                ConversationParticipant.conversation_id.in_(conv_ids),
                ConversationParticipant.participant_type == 'agent'
            )
            part_result = await db.execute(participant_query)
            participants = part_result.scalars().all()
            
            agent_map = {cid: [] for cid in conv_ids}
            for p in participants:
                agent_map[p.conversation_id].append(p.participant_id)
                
            for c in conversations:
                c_dict = {
                    "id": c.id,
                    "title": c.title,
                    "type": c.type,
                    "owner_id": c.owner_id,
                    "is_archived": c.is_archived,
                    "is_pinned": c.is_pinned,
                    "last_active_at": c.last_active_at,
                    "created_at": c.created_at,
                    "updated_at": c.updated_at,
                    "agent_ids": agent_map.get(c.id, [])
                }
                items.append(c_dict)
                
        return Page(list=items, total=total, page=page, page_size=page_size)

    @staticmethod
    async def create_conversation(db: AsyncSession, user_id: UUID, data: ConversationCreate):
        new_conv = Conversation(
            title=data.title,
            type=data.type,
            owner_id=user_id,
            last_active_at=datetime.now(timezone.utc)
        )
        db.add(new_conv)
        await db.flush()
        
        if data.agent_ids:
            for agent_id in data.agent_ids:
                part = ConversationParticipant(
                    conversation_id=new_conv.id,
                    participant_type='agent',
                    participant_id=agent_id
                )
                db.add(part)
        
        await db.commit()
        await db.refresh(new_conv)
        return await ConversationService.get_conversation(db, new_conv.id)
        
    @staticmethod
    async def get_conversation(db: AsyncSession, conv_id: UUID):
        query = select(Conversation).where(Conversation.id == conv_id)
        result = await db.execute(query)
        conv = result.scalar_one_or_none()
        if not conv:
            raise HTTPException(status_code=404, detail="Conversation not found")
            
        part_query = select(ConversationParticipant.participant_id).where(
            ConversationParticipant.conversation_id == conv_id,
            ConversationParticipant.participant_type == 'agent'
        )
        parts = await db.execute(part_query)
        agent_ids = parts.scalars().all()
        
        return {
            "id": conv.id,
            "title": conv.title,
            "type": conv.type,
            "owner_id": conv.owner_id,
            "is_archived": conv.is_archived,
            "is_pinned": conv.is_pinned,
            "last_active_at": conv.last_active_at,
            "created_at": conv.created_at,
            "updated_at": conv.updated_at,
            "agent_ids": list(agent_ids)
        }

    @staticmethod
    async def update_conversation(db: AsyncSession, user_id: UUID, conv_id: UUID, data: ConversationUpdate):
        query = select(Conversation).where(Conversation.id == conv_id, Conversation.owner_id == user_id)
        result = await db.execute(query)
        conv = result.scalar_one_or_none()
        if not conv:
            raise HTTPException(status_code=404, detail="Conversation not found")
            
        if data.title is not None:
            conv.title = data.title
        if data.is_archived is not None:
            conv.is_archived = data.is_archived
        if data.is_pinned is not None:
            conv.is_pinned = data.is_pinned
            
        if data.agent_ids is not None:
            # Delete existing agents
            del_q = delete(ConversationParticipant).where(
                ConversationParticipant.conversation_id == conv_id,
                ConversationParticipant.participant_type == 'agent'
            )
            await db.execute(del_q)
            # Add new agents
            for agent_id in data.agent_ids:
                part = ConversationParticipant(
                    conversation_id=conv_id,
                    participant_type='agent',
                    participant_id=agent_id
                )
                db.add(part)
                
        await db.commit()
        return await ConversationService.get_conversation(db, conv_id)

    @staticmethod
    async def delete_conversation(db: AsyncSession, user_id: UUID, conv_id: UUID):
        query = select(Conversation).where(Conversation.id == conv_id, Conversation.owner_id == user_id)
        result = await db.execute(query)
        conv = result.scalar_one_or_none()
        if not conv:
            raise HTTPException(status_code=404, detail="Conversation not found")

        # Collect related message IDs for cascade cleanup
        msg_query = select(Message.id).where(Message.conversation_id == conv_id)
        msg_result = await db.execute(msg_query)
        message_ids = [row[0] for row in msg_result.fetchall()]

        # 1. Delete orchestrator_subtasks (FK → orchestrator_tasks, messages)
        if message_ids:
            await db.execute(delete(OrchestratorSubtask).where(
                OrchestratorSubtask.task_id.in_(
                    select(OrchestratorTask.id).where(OrchestratorTask.conversation_id == conv_id)
                )
            ))
            # Also delete subtasks referencing messages in this conversation
            await db.execute(delete(OrchestratorSubtask).where(
                OrchestratorSubtask.output_message_id.in_(message_ids)
            ))

        # 2. Delete orchestrator_tasks (FK → conversations, messages)
        await db.execute(delete(OrchestratorTask).where(OrchestratorTask.conversation_id == conv_id))

        # 3. Delete message_mentions (FK → messages)
        if message_ids:
            await db.execute(delete(MessageMention).where(MessageMention.message_id.in_(message_ids)))

        # 4. Delete artifacts (FK → conversations, messages)
        await db.execute(delete(Artifact).where(Artifact.conversation_id == conv_id))

        # 5. Delete message_pins (FK → conversations, messages)
        await db.execute(delete(MessagePin).where(MessagePin.conversation_id == conv_id))

        # 6. Delete messages (FK → conversations)
        await db.execute(delete(Message).where(Message.conversation_id == conv_id))

        # 7. Delete conversation_participants (FK → conversations)
        await db.execute(delete(ConversationParticipant).where(
            ConversationParticipant.conversation_id == conv_id
        ))

        # 8. Delete conversation
        await db.execute(delete(Conversation).where(Conversation.id == conv_id))
        await db.commit()

