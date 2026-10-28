"""Entries of one plate: entry.group_id and entry.group_name (SPEC 4, SPEC 7a).

Both nullable; existing entries stay single entries, no data is rewritten.

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-28
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("entry", sa.Column("group_id", sa.Uuid(), nullable=True))
    op.add_column("entry", sa.Column("group_name", sa.Text(), nullable=True))
    op.create_index("entry_group_id", "entry", ["group_id"])


def downgrade() -> None:
    op.drop_index("entry_group_id", table_name="entry")
    op.drop_column("entry", "group_name")
    op.drop_column("entry", "group_id")
