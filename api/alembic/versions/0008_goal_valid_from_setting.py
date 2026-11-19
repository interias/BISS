"""Goals from a start day and the setting row (ADR-0015).

A goal row is either the goal of one day (`day`) or a default from a day on (`valid_from`).
A stored default gets the first day with an entry as its start, else the current date.

Revision ID: 0008
Revises: 0007
Create Date: 2026-11-19
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("goal", sa.Column("valid_from", sa.Date()))
    op.execute(
        "UPDATE goal SET valid_from = COALESCE((SELECT min(day) FROM entry), CURRENT_DATE) "
        "WHERE day IS NULL"
    )
    # Several defaults now, one per start day; still at most one goal per day.
    op.drop_constraint("goal_day", "goal", type_="unique")
    op.create_unique_constraint("goal_day", "goal", ["day"])
    op.create_unique_constraint("goal_valid_from", "goal", ["valid_from"])
    op.create_check_constraint(
        "goal_day_or_valid_from", "goal", "(day IS NULL) <> (valid_from IS NULL)"
    )

    op.create_table(
        "setting",
        sa.Column("id", sa.SmallInteger(), primary_key=True, server_default="1"),
        sa.Column("tolerance", sa.Double(), nullable=False, server_default="0.10"),
        sa.CheckConstraint("id = 1", name="setting_single_row"),
        sa.CheckConstraint("tolerance >= 0.05 AND tolerance <= 0.20", name="setting_tolerance"),
    )
    op.execute("INSERT INTO setting (id) VALUES (1)")


def downgrade() -> None:
    op.drop_table("setting")
    # Only the newest default survives as the single default of before.
    op.execute(
        "DELETE FROM goal WHERE valid_from IS NOT NULL "
        "AND valid_from < (SELECT max(valid_from) FROM goal)"
    )
    op.drop_constraint("goal_day_or_valid_from", "goal", type_="check")
    op.drop_constraint("goal_valid_from", "goal", type_="unique")
    op.drop_constraint("goal_day", "goal", type_="unique")
    op.drop_column("goal", "valid_from")
    op.execute("ALTER TABLE goal ADD CONSTRAINT goal_day UNIQUE NULLS NOT DISTINCT (day)")
