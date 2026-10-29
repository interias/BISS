"""Schnellzugriff: combo and combo_item, a saved template of foods with grams (ADR-0010).

Logging a combo writes an entry group as a plate does (SPEC 4); the template stays.

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-29
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "combo",
        sa.Column("id", sa.BigInteger(), sa.Identity(), primary_key=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )
    op.create_table(
        "combo_item",
        sa.Column("id", sa.BigInteger(), sa.Identity(), primary_key=True),
        sa.Column(
            "combo_id",
            sa.BigInteger(),
            sa.ForeignKey("combo.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("food_id", sa.BigInteger(), sa.ForeignKey("food.id"), nullable=False),
        sa.Column("grams", sa.Double(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.CheckConstraint("grams > 0 AND grams <= 1500", name="combo_item_grams"),
    )


def downgrade() -> None:
    op.drop_table("combo_item")
    op.drop_table("combo")
