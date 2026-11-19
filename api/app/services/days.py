"""Day summary: totals against the goals, the diary rows and the entries by meal."""

from dataclasses import dataclass
from datetime import UTC, date, datetime
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.domain.goals import Targets, load_goals, targets_for
from app.domain.macros import Macros, total
from app.domain.meal import Meal, suggest_meal
from app.domain.stats import days_of
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
class EntryRow:
    """A diary row of an entry alone."""

    entry: Entry
    food: Food


@dataclass(frozen=True)
class GroupRow:
    """A diary row of a plate or Schnellzugriff with its entries by time."""

    group_id: UUID
    group_name: str
    meal: Meal
    eaten_at: datetime
    totals: Macros
    entries: list[tuple[Entry, Food]]


@dataclass(frozen=True)
class DaySummary:
    day: date
    totals: Macros
    targets: Targets
    # The diary as the app shows it: newest first, without meals.
    rows: list[EntryRow | GroupRow]
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


def _rows(rows: list[tuple[Entry, Food]]) -> list[EntryRow | GroupRow]:
    """Entries alone and plates, newest first; a plate stands at the time of its first entry.

    `rows` come by time; on equal times the later id counts as newer.
    """
    by_group: dict[UUID, list[tuple[Entry, Food]]] = {}
    for entry, food in rows:
        if entry.group_id is not None:
            by_group.setdefault(entry.group_id, []).append((entry, food))
    found: list[EntryRow | GroupRow] = []
    for entry, food in rows:
        if entry.group_id is None:
            found.append(EntryRow(entry, food))
        elif (members := by_group[entry.group_id])[0][0] is entry:
            found.append(
                GroupRow(
                    entry.group_id,
                    entry.group_name,
                    Meal(entry.meal),
                    entry.eaten_at,
                    total(e for e, _ in members),
                    members,
                )
            )
    return found[::-1]


def day_summary(session: Session, day: date, now: datetime | None = None) -> DaySummary:
    """The diary rows newest first, all four meals in order with their entries by time,
    and the meal suggested now. The app shows only the rows; meals stay for the API."""
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
        rows=_rows(rows),
        meals=meals,
        suggested_meal=suggest_meal(now or datetime.now(UTC)),
    )


@dataclass(frozen=True)
class DayTotals:
    """A day of a range: its totals, the goal that applies and the number of entries."""

    day: date
    totals: Macros
    targets: Targets
    entries: int


def logged_totals(session: Session, start: date, end: date) -> dict[date, tuple[Macros, int]]:
    """Totals and number of entries of the days from start to end with entries, in one query."""
    rows = session.execute(
        select(
            Entry.day,
            func.sum(Entry.kcal),
            func.sum(Entry.protein),
            func.sum(Entry.carbs),
            func.sum(Entry.fat),
            func.count(),
        )
        .where(Entry.day.between(start, end))
        .group_by(Entry.day)
    ).all()
    return {
        day: (Macros(*(round(value, 1) for value in sums)), entries) for day, *sums, entries in rows
    }


def day_range(session: Session, start: date, end: date) -> list[DayTotals]:
    """Every day from start to end, ascending; days without entries with zero totals."""
    logged = logged_totals(session, start, end)
    goals = load_goals(session)
    found = []
    for day in days_of(start, end):
        totals, entries = logged.get(day, (Macros(0, 0, 0, 0), 0))
        found.append(DayTotals(day, totals, goals.of(day), entries))
    return found
