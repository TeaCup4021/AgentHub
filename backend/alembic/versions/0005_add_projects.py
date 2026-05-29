"""add_projects

Revision ID: 0005
Revises: 0004
Create Date: 2026-05-29 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision: str = '0005'
down_revision: Union[str, None] = '0004'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'projects',
        sa.Column('id', UUID(), nullable=False),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('owner_id', UUID(), nullable=False),
        sa.Column('default_agent_ids', sa.ARRAY(UUID()), server_default='{}', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['owner_id'], ['users.id']),
    )

    op.add_column(
        'conversations',
        sa.Column('project_id', UUID(), nullable=True),
    )
    op.create_foreign_key(
        'fk_conversations_project_id',
        'conversations', 'projects',
        ['project_id'], ['id'],
        ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint('fk_conversations_project_id', 'conversations', type_='foreignkey')
    op.drop_column('conversations', 'project_id')
    op.drop_table('projects')
