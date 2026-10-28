"""Day summary: totals against the goals and the entries by meal."""

from dataclasses import dataclass
from datetime import UTC, date, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domain.goals import Targets, targets_for
from app.domain.macros import Macros, total
from app.domain.meal import Meal, suggest_meal
from app.models import Entry, Food


@dataclass(frozen=True)
class DayGroup:
    """A plate within a meal: the ids of its entries among the meal's, and their sum."""

    group_id: UUID
    group_name: str
    totals: Macros
    entry_ids: list[int]


@dataclass(frozen=True)
class MealEntries:
    meal: Meal
    totals: Macros
    entries: list[tuple[Entry, Food]]
    groups: list[DayGroup]


@dataclass(frozen=True)
class DaySummary:
    day: date
    totals: Macros
    targets: Targets
    meals: list[MealEntries]
    suggested_meal: Meal


def _sum(entries: list[Entry]) -> Macros:
    return Macros(
        kcal=round(sum(e.kcal for e in entries), 1),
        protein=round(sum(e.protein for e in entries), 1),
        carbs=round(sum(e.carbs for e in entries), 1),
        fat=round(sum(e.fat for e in entries), 1),
    )


def _groups(entries: list[Entry]) -> list[DayGroup]:
    """The plates among the entries, in the order of their first entry."""
    by_group: dict[UUID, list[Entry]] = {}
    for entry in entries:
        if entry.group_id is not None:
            by_group.setdefault(entry.group_id, []).append(entry)
    return [
        DayGroup(group_id, members[0].group_name, total(members), [e.id for e in members])
        for group_id, members in by_group.items()
    ]


def day_summary(session: Session, day: date, now: datetime | None = None) -> DaySummary:
    """All four meals in order, each with its entries by time; the meal suggested now."""
    rows = session.execute(
        select(Entry, Food)
        .join(Food, Food.id == Entry.food_id)
        .where(Entry.day == day)
        .order_by(Entry.eaten_at, Entry.id)
    ).all()
    meals = []
    for meal in Meal:
        entries = [(entry, food) for entry, food in rows if entry.meal == meal]
        plain = [e for e, _ in entries]
        meals.append(MealEntries(meal, _sum(plain), entries, _groups(plain)))
    return DaySummary(
        day=day,
        totals=_sum([entry for entry, _ in rows]),
        targets=targets_for(session, day),
        meals=meals,
        suggested_meal=suggest_meal(now or datetime.now(UTC)),
    )
