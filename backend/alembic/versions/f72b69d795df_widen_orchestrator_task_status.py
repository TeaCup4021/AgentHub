"""widen_orchestrator_task_status

Revision ID: f72b69d795df
Revises: 5d5de79ca0e1
Create Date: 2026-05-27 22:50:31.194431

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f72b69d795df'
down_revision: Union[str, None] = '5d5de79ca0e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "orchestrator_tasks",
        "status",
        existing_type=sa.String(20),
        type_=sa.String(50),
        existing_nullable=False,
        existing_server_default="queued",
    )
    op.alter_column(
        "orchestrator_subtasks",
        "status",
        existing_type=sa.String(20),
        type_=sa.String(50),
        existing_nullable=False,
        existing_server_default="queued",
    )


def downgrade() -> None:
    op.alter_column(
        "orchestrator_tasks",
        "status",
        existing_type=sa.String(50),
        type_=sa.String(20),
        existing_nullable=False,
        existing_server_default="queued",
    )
    op.alter_column(
        "orchestrator_subtasks",
        "status",
        existing_type=sa.String(50),
        type_=sa.String(20),
        existing_nullable=False,
        existing_server_default="queued",
    )
