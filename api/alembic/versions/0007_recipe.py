"""Rezept: recipe and recipe_item, an own dish made from foods (ADR-0012).

The recipe's food carries the values per 100 g of the finished dish; the tables keep what
they are computed from.

Revision ID: 0007
Revises: 0006
Create Date: 2026-11-14
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "recipe",
        sa.Column("id", sa.BigInteger(), sa.Identity(), primary_key=True),
        sa.Column(
            "food_id", sa.BigInteger(), sa.ForeignKey("food.id"), nullable=False, unique=True
        ),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("portions", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("cooked_grams", sa.Double()),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.CheckConstraint("portions >= 1 AND portions <= 100", name="recipe_portions"),
        sa.CheckConstraint(
            "cooked_grams IS NULL OR (cooked_grams > 0 AND cooked_grams <= 50000)",
            name="recipe_cooked_grams",
        ),
    )
    op.create_table(
        "recipe_item",
        sa.Column("id", sa.BigInteger(), sa.Identity(), primary_key=True),
        sa.Column(
            "recipe_id",
            sa.BigInteger(),
            sa.ForeignKey("recipe.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("food_id", sa.BigInteger(), sa.ForeignKey("food.id"), nullable=False),
        sa.Column("grams", sa.Double(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.CheckConstraint("grams > 0 AND grams <= 10000", name="recipe_item_grams"),
    )


def downgrade() -> None:
    op.drop_table("recipe_item")
    op.drop_table("recipe")
