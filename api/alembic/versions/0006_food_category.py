"""Food category: food.category, the symbol group of a food without a photo (SPEC 4).

Nullable; existing BLS foods get it from their code. The mapping is copied from
app.domain.category as it stood, so the migration does not change with that module. Own
and Open Food Facts foods stay without one and show the symbol of "other".

Revision ID: 0006
Revises: 0005
Create Date: 2026-10-29
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

CATEGORIES = (
    "bread",
    "grains",
    "fruit",
    "vegetables",
    "legumes",
    "potatoes",
    "dairy",
    "eggs",
    "meat",
    "sausage",
    "fish",
    "fats",
    "sweets",
    "drinks",
    "dishes",
    "other",
)
BLS_SUBGROUPS = {"E1": "eggs", "E2": "eggs", "E3": "eggs", "K7": "vegetables", "K8": "vegetables"}
BLS_GROUPS = {
    "B": "bread",
    "C": "grains",
    "D": "sweets",
    "E": "grains",
    "F": "fruit",
    "G": "vegetables",
    "H": "legumes",
    "K": "potatoes",
    "M": "dairy",
    "N": "drinks",
    "P": "drinks",
    "Q": "fats",
    "R": "other",
    "S": "sweets",
    "T": "fish",
    "U": "meat",
    "V": "meat",
    "W": "sausage",
    "X": "dishes",
    "Y": "dishes",
}


def upgrade() -> None:
    op.add_column("food", sa.Column("category", sa.Text(), nullable=True))
    listed = ", ".join(f"'{c}'" for c in CATEGORIES)
    op.create_check_constraint("food_category", "food", f"category IN ({listed})")
    sub = " ".join(f"WHEN '{k}' THEN '{v}'" for k, v in BLS_SUBGROUPS.items())
    main = " ".join(f"WHEN '{k}' THEN '{v}'" for k, v in BLS_GROUPS.items())
    op.execute(
        f"""
        UPDATE food SET category = coalesce(
            CASE left(source_id, 2) {sub} END,
            CASE left(source_id, 1) {main} END)
        WHERE source = 'bls'
        """
    )


def downgrade() -> None:
    op.drop_constraint("food_category", "food", type_="check")
    op.drop_column("food", "category")
