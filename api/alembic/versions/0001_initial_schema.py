"""Initial schema: food, food_source_data, serving, entry, goal.

Revision ID: 0001
Revises:
Create Date: 2026-10-28
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Search normalisation (SPEC 6). unaccent() is only STABLE, so it is wrapped in an
# IMMUTABLE function with an explicit dictionary to be usable in a generated column.
# Umlauts and ß are replaced before unaccent, otherwise ä would become a instead of ae.
# Steps: umlauts -> unaccent -> lower case -> drop quantities like "500 g" or "1,5 l"
# -> punctuation and hyphens to spaces -> collapse and trim spaces.
NORMALIZE_FUNCTION = r"""
CREATE FUNCTION biss_normalize(value text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
RETURN btrim(regexp_replace(regexp_replace(
    lower(public.unaccent('public.unaccent'::regdictionary,
        replace(replace(replace(replace(replace(replace(replace(value,
            'ä', 'ae'), 'ö', 'oe'), 'ü', 'ue'), 'Ä', 'Ae'), 'Ö', 'Oe'), 'Ü', 'Ue'), 'ß', 'ss'))),
    '\m\d+([.,]\d+)?\s*(mg|g|kg|ml|cl|dl|l)\M', ' ', 'g'),
    '[^a-z0-9]+', ' ', 'g'))
"""


def _nutrient(name: str, nullable: bool = False) -> sa.Column:
    return sa.Column(name, sa.Double(), nullable=nullable)


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.execute("CREATE EXTENSION IF NOT EXISTS unaccent")
    op.execute(NORMALIZE_FUNCTION)

    op.create_table(
        "food",
        sa.Column("id", sa.BigInteger(), sa.Identity(), primary_key=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("brand", sa.Text()),
        sa.Column("gtin", sa.String(14), unique=True),
        sa.Column("basis", sa.Text(), nullable=False, server_default="g"),
        sa.Column("density", sa.Double(), nullable=False, server_default="1.0"),
        _nutrient("kcal"),
        _nutrient("protein"),
        _nutrient("carbs"),
        _nutrient("fat"),
        _nutrient("fiber", nullable=True),
        _nutrient("sugar", nullable=True),
        _nutrient("sat_fat", nullable=True),
        _nutrient("salt", nullable=True),
        sa.Column("image_path", sa.Text()),
        sa.Column("source", sa.Text(), nullable=False),
        sa.Column("source_id", sa.Text()),
        sa.Column("fetched_at", sa.DateTime(timezone=True)),
        sa.Column(
            "overridden",
            postgresql.ARRAY(sa.Text()),
            nullable=False,
            server_default="{}",
        ),
        sa.Column(
            "name_norm",
            sa.Text(),
            sa.Computed("biss_normalize(name)", persisted=True),
            nullable=False,
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.CheckConstraint("basis IN ('g', 'ml')", name="food_basis"),
        sa.CheckConstraint("density > 0", name="food_density"),
        sa.CheckConstraint("source IN ('own', 'bls', 'off')", name="food_source"),
        sa.UniqueConstraint("source", "source_id", name="food_source_source_id"),
    )
    op.execute("CREATE INDEX food_name_norm_trgm ON food USING gin (name_norm gin_trgm_ops)")

    op.create_table(
        "food_source_data",
        sa.Column(
            "food_id",
            sa.BigInteger(),
            sa.ForeignKey("food.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("source", sa.Text(), primary_key=True),
        sa.Column("source_id", sa.Text(), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column(
            "fetched_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )

    op.create_table(
        "serving",
        sa.Column("id", sa.BigInteger(), sa.Identity(), primary_key=True),
        sa.Column(
            "food_id",
            sa.BigInteger(),
            sa.ForeignKey("food.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("label", sa.Text(), nullable=False),
        sa.Column("grams", sa.Double(), nullable=False),
        sa.Column("origin", sa.Text(), nullable=False),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.CheckConstraint("grams > 0", name="serving_grams"),
        sa.CheckConstraint("origin IN ('package', 'estimated', 'own')", name="serving_origin"),
    )
    # At most one standard serving per food.
    op.create_index(
        "serving_one_default",
        "serving",
        ["food_id"],
        unique=True,
        postgresql_where=sa.text("is_default"),
    )

    op.create_table(
        "entry",
        sa.Column("id", sa.BigInteger(), sa.Identity(), primary_key=True),
        sa.Column("food_id", sa.BigInteger(), sa.ForeignKey("food.id"), nullable=False, index=True),
        sa.Column("grams", sa.Double(), nullable=False),
        sa.Column("meal", sa.Text(), nullable=False),
        sa.Column("eaten_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("day", sa.Date(), nullable=False, index=True),
        _nutrient("kcal"),
        _nutrient("protein"),
        _nutrient("carbs"),
        _nutrient("fat"),
        sa.CheckConstraint("grams > 0", name="entry_grams"),
        sa.CheckConstraint("meal IN ('breakfast', 'lunch', 'snack', 'dinner')", name="entry_meal"),
    )

    op.create_table(
        "goal",
        sa.Column("id", sa.BigInteger(), sa.Identity(), primary_key=True),
        sa.Column("day", sa.Date()),
        _nutrient("kcal"),
        _nutrient("protein"),
        _nutrient("carbs"),
        _nutrient("fat"),
    )
    # At most one goal per day and a single row for the default (day IS NULL).
    op.execute("ALTER TABLE goal ADD CONSTRAINT goal_day UNIQUE NULLS NOT DISTINCT (day)")


def downgrade() -> None:
    op.drop_table("goal")
    op.drop_table("entry")
    op.drop_table("serving")
    op.drop_table("food_source_data")
    op.drop_table("food")
    op.execute("DROP FUNCTION biss_normalize(text)")
