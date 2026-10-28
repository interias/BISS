"""Search over the Open Food Facts cache: off_cache.name_norm and brand_norm.

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-28
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# The name and brand that off.draft() reads from the payload, normalised like
# food.name_norm (SPEC 6). Name: product_name_de, else product_name, each only as a string
# with a non-space character. Brand: the first non-empty part of the comma-separated brands.
NAME_NORM = r"""biss_normalize(CASE
    WHEN jsonb_typeof(payload #> '{product,product_name_de}') = 'string'
         AND payload #>> '{product,product_name_de}' ~ '\S'
    THEN payload #>> '{product,product_name_de}'
    WHEN jsonb_typeof(payload #> '{product,product_name}') = 'string'
         AND payload #>> '{product,product_name}' ~ '\S'
    THEN payload #>> '{product,product_name}' END)"""
BRAND_NORM = r"""biss_normalize(substring(CASE
    WHEN jsonb_typeof(payload #> '{product,brands}') = 'string'
    THEN payload #>> '{product,brands}' END FROM '[^,]*[^,\s][^,]*'))"""


def upgrade() -> None:
    op.add_column(
        "off_cache", sa.Column("name_norm", sa.Text(), sa.Computed(NAME_NORM, persisted=True))
    )
    op.add_column(
        "off_cache", sa.Column("brand_norm", sa.Text(), sa.Computed(BRAND_NORM, persisted=True))
    )
    op.execute(
        "CREATE INDEX off_cache_name_norm_trgm ON off_cache USING gin (name_norm gin_trgm_ops)"
    )


def downgrade() -> None:
    op.drop_index("off_cache_name_norm_trgm", table_name="off_cache")
    op.drop_column("off_cache", "brand_norm")
    op.drop_column("off_cache", "name_norm")
