"""add_dag_fields_to_subtasks

Revision ID: 0003
Revises: f72b69d795df
Create Date: 2026-05-28 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision: str = '0003'
down_revision: Union[str, None] = 'f72b69d795df'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "orchestrator_subtasks",
        sa.Column("depends_on", JSONB, nullable=True),
    )
    op.add_column(
        "orchestrator_subtasks",
        sa.Column("mode", sa.String(20), nullable=False, server_default="single_turn"),
    )
    op.add_column(
        "orchestrator_subtasks",
        sa.Column("execution_order", sa.Integer, nullable=True),
    )


def downgrade() -> None:
    op.drop_column("orchestrator_subtasks", "execution_order")
    op.drop_column("orchestrator_subtasks", "mode")
    op.drop_column("orchestrator_subtasks", "depends_on")
