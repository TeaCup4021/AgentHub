"""demote DeepSeek V4 / Claude Opus / GPT-4o from is_builtin to user-created

Revision ID: 0006
Revises: 630cc95100f2
Create Date: 2026-06-04 16:10:00.000000

"""

from typing import Sequence, Union
from alembic import op
import uuid

# revision identifiers, used by Alembic.
revision: str = "0006"
down_revision: Union[str, None] = "630cc95100f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001"


def upgrade() -> None:
    op.execute(
        "UPDATE agents SET is_builtin = false, created_by = '%s' "
        "WHERE id IN ('e77f4176-297a-4b8f-a76e-3fe50b97422a', "
        "'e5776315-70ff-4538-ac04-b2ac7e4ff6bd', "
        "'d23018af-3725-4d8d-a83c-5225d00e7ad3') "
        "AND is_builtin = true" % SYSTEM_USER_ID
    )


def downgrade() -> None:
    op.execute(
        "UPDATE agents SET is_builtin = true, created_by = NULL "
        "WHERE id IN ('e77f4176-297a-4b8f-a76e-3fe50b97422a', "
        "'e5776315-70ff-4538-ac04-b2ac7e4ff6bd', "
        "'d23018af-3725-4d8d-a83c-5225d00e7ad3') "
        "AND is_builtin = false AND created_by = '%s'" % SYSTEM_USER_ID
    )
