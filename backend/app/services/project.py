from uuid import UUID
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from app.models.project import Project
from app.models.conversation import Conversation
from app.schemas.project import ProjectCreate, ProjectUpdate
from fastapi import HTTPException


class ProjectService:

    @staticmethod
    async def create_project(
        db: AsyncSession, user_id: UUID, data: ProjectCreate
    ) -> dict:
        project = Project(
            name=data.name,
            description=data.description,
            owner_id=user_id,
            default_agent_ids=data.default_agent_ids or [],
        )
        db.add(project)
        await db.commit()
        await db.refresh(project)
        return ProjectService._to_response(project, conversation_count=0)

    @staticmethod
    async def list_projects(
        db: AsyncSession, user_id: UUID
    ) -> list[dict]:
        query = (
            select(
                Project,
                func.count(Conversation.id).label("conv_count"),
            )
            .outerjoin(
                Conversation,
                (Conversation.project_id == Project.id)
                & (Conversation.is_deleted == False),
            )
            .where(Project.owner_id == user_id)
            .group_by(Project.id)
            .order_by(desc(Project.updated_at))
        )
        result = await db.execute(query)
        rows = result.all()

        return [
            {
                "id": row.Project.id,
                "name": row.Project.name,
                "description": row.Project.description,
                "owner_id": row.Project.owner_id,
                "default_agent_ids": row.Project.default_agent_ids or [],
                "conversation_count": row.conv_count,
                "created_at": row.Project.created_at,
                "updated_at": row.Project.updated_at,
            }
            for row in rows
        ]

    @staticmethod
    async def get_project(
        db: AsyncSession, user_id: UUID, project_id: UUID
    ) -> dict:
        project = await ProjectService._get_owned(db, user_id, project_id)

        count_result = await db.execute(
            select(func.count(Conversation.id)).where(
                Conversation.project_id == project_id,
                Conversation.is_deleted == False,
            )
        )
        conv_count = count_result.scalar_one_or_none() or 0

        return ProjectService._to_response(project, conversation_count=conv_count)

    @staticmethod
    async def update_project(
        db: AsyncSession, user_id: UUID, project_id: UUID, data: ProjectUpdate
    ) -> dict:
        project = await ProjectService._get_owned(db, user_id, project_id)

        if data.name is not None:
            project.name = data.name
        if data.description is not None:
            project.description = data.description
        if data.default_agent_ids is not None:
            project.default_agent_ids = data.default_agent_ids

        await db.commit()
        await db.refresh(project)

        count_result = await db.execute(
            select(func.count(Conversation.id)).where(
                Conversation.project_id == project_id,
                Conversation.is_deleted == False,
            )
        )
        conv_count = count_result.scalar_one_or_none() or 0
        return ProjectService._to_response(project, conversation_count=conv_count)

    @staticmethod
    async def delete_project(
        db: AsyncSession, user_id: UUID, project_id: UUID
    ) -> None:
        project = await ProjectService._get_owned(db, user_id, project_id)
        await db.delete(project)
        await db.commit()

    @staticmethod
    async def _get_owned(db: AsyncSession, user_id: UUID, project_id: UUID) -> Project:
        result = await db.execute(
            select(Project).where(
                Project.id == project_id, Project.owner_id == user_id
            )
        )
        project = result.scalar_one_or_none()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        return project

    @staticmethod
    def _to_response(project: Project, conversation_count: int) -> dict:
        return {
            "id": project.id,
            "name": project.name,
            "description": project.description,
            "owner_id": project.owner_id,
            "default_agent_ids": project.default_agent_ids or [],
            "conversation_count": conversation_count,
            "created_at": project.created_at,
            "updated_at": project.updated_at,
        }
