"""add_auth_fields

Revision ID: 0004
Revises: 0003
Create Date: 2026-05-29 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision: str = '0004'
down_revision: Union[str, None] = '0003'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('password_hash', sa.String(255), nullable=True))
    op.add_column('users', sa.Column('is_verified', sa.Boolean(), server_default='false', nullable=False))

    op.create_table(
        'verification_codes',
        sa.Column('id', UUID(), nullable=False),
        sa.Column('email', sa.String(255), nullable=False),
        sa.Column('code', sa.String(6), nullable=False),
        sa.Column('purpose', sa.String(20), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('used', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_vc_email_purpose', 'verification_codes', ['email', 'purpose'])


def downgrade() -> None:
    op.drop_index('idx_vc_email_purpose', table_name='verification_codes')
    op.drop_table('verification_codes')
    op.drop_column('users', 'is_verified')
    op.drop_column('users', 'password_hash')
