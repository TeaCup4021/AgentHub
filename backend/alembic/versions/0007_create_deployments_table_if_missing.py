"""create deployments table if missing

Revision ID: 0007
Revises: 2cb4272008eb
Create Date: 2026-06-07 23:25:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0007"
down_revision: Union[str, None] = "2cb4272008eb"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _deployments_table() -> sa.Table:
    return sa.Table(
        "deployments",
        sa.MetaData(),
        sa.Column("id", postgresql.UUID(), nullable=False),
        sa.Column("conversation_id", postgresql.UUID(), nullable=False),
        sa.Column("user_id", postgresql.UUID(), nullable=False),
        sa.Column("trigger_message_id", postgresql.UUID(), nullable=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("target", sa.String(length=30), nullable=False, server_default="preview"),
        sa.Column("port", sa.Integer(), nullable=True),
        sa.Column("directory", sa.String(length=512), nullable=True),
        sa.Column("url", sa.String(length=1000), nullable=True),
        sa.Column("download_url", sa.String(length=1000), nullable=True),
        sa.Column(
            "source_files",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "source_summary",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "runtime_meta",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "logs",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("process_pid", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="ready"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("stopped_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
    )


def upgrade() -> None:
    bind = op.get_bind()
    table = _deployments_table()
    table.create(bind, checkfirst=True)

    op.create_index(
        "ix_deployments_conversation_id",
        "deployments",
        ["conversation_id"],
        if_not_exists=True,
    )
    op.create_index(
        "ix_deployments_trigger_message_id",
        "deployments",
        ["trigger_message_id"],
        if_not_exists=True,
    )
    op.create_index(
        "ix_deployments_user_id",
        "deployments",
        ["user_id"],
        if_not_exists=True,
    )
    op.create_unique_constraint(
        "uq_deployments_port",
        "deployments",
        ["port"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_deployments_port", "deployments", type_="unique", if_exists=True)
    op.drop_index("ix_deployments_user_id", table_name="deployments", if_exists=True)
    op.drop_index("ix_deployments_trigger_message_id", table_name="deployments", if_exists=True)
    op.drop_index("ix_deployments_conversation_id", table_name="deployments", if_exists=True)
    op.drop_table("deployments", if_exists=True)
