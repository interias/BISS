"""Statistik of a period: loads the totals, entries, goals and tolerance the rules need."""

from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domain.goals import load_goals
from app.domain.stats import TRAILING_DAYS, EatenItem, Stats, previous_period, statistics
from app.models import Entry, Food
from app.services import settings
from app.services.days import logged_totals


def period_stats(session: Session, start: date, end: date, today: date) -> Stats:
    """The statistics of start..end as of today (app.domain.stats)."""
    first = min(previous_period(start, end)[0], start - timedelta(days=TRAILING_DAYS - 1))
    logged = {day: totals for day, (totals, _) in logged_totals(session, first, end).items()}
    rows = session.execute(
        select(
            Entry.day,
            Entry.eaten_at,
            Entry.kcal,
            Food.id,
            Food.name,
            Entry.group_id,
            Entry.group_name,
        )
        .join(Food, Food.id == Entry.food_id)
        .where(Entry.day.between(start, min(end, today - timedelta(days=1))))
    ).all()
    return statistics(
        start,
        end,
        today,
        logged,
        [EatenItem(*row) for row in rows],
        load_goals(session),
        settings.tolerance(session),
    )
