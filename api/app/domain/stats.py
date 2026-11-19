"""Statistik of a period (SPEC 4, ADR-0015): only closed days (before today) with at least one
entry count, each against the goal that applied on it."""

import calendar
from collections import Counter, defaultdict
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from typing import Literal
from uuid import UUID

from app.domain.day import to_local
from app.domain.goals import Goals, Targets
from app.domain.macros import Macros
from app.domain.meal import Meal, suggest_meal

MAX_PERIOD_DAYS = 366
TRAILING_DAYS = 7
TOP_COUNT = 5
FIELDS = ("kcal", "protein", "carbs", "fat")

TimeOfDay = Literal["morning", "midday", "afternoon", "evening"]
# The bounds of the meal suggestion: breakfast until 10:30, lunch until 14:30, snack until 17:30.
_TIME_OF_MEAL: dict[Meal, TimeOfDay] = {
    Meal.BREAKFAST: "morning",
    Meal.LUNCH: "midday",
    Meal.SNACK: "afternoon",
    Meal.DINNER: "evening",
}
# Before the day boundary an entry belongs to the evening before, not to the morning.
_NIGHT_ENDS = time(4, 0)


def check_period(start: date, end: date) -> None:
    """Raises ValueError unless start..end is a period of 1 to 366 days."""
    if end < start:
        raise ValueError("to must not lie before from")
    if (end - start).days + 1 > MAX_PERIOD_DAYS:
        raise ValueError(f"a period has at most {MAX_PERIOD_DAYS} days")


def days_of(start: date, end: date) -> list[date]:
    return [start + timedelta(days=offset) for offset in range((end - start).days + 1)]


def previous_period(start: date, end: date) -> tuple[date, date]:
    """The calendar month before for a calendar month, else as many days directly before."""
    if start.day == 1 and end == start.replace(day=calendar.monthrange(start.year, start.month)[1]):
        last = start - timedelta(days=1)
        return last.replace(day=1), last
    return start - (end - start) - timedelta(days=1), start - timedelta(days=1)


def time_of_day(eaten_at: datetime) -> TimeOfDay:
    """The time of day by local clock time, with the bounds of the meal suggestion."""
    if to_local(eaten_at).time() < _NIGHT_ENDS:
        return "evening"
    return _TIME_OF_MEAL[suggest_meal(eaten_at)]


@dataclass(frozen=True)
class EatenItem:
    """An entry as the statistics read it."""

    day: date
    eaten_at: datetime
    kcal: float
    food_id: int
    food_name: str
    group_id: UUID | None
    group_name: str | None


@dataclass(frozen=True)
class Previous:
    start: date
    end: date
    average_kcal: float | None


@dataclass(frozen=True)
class TopItem:
    name: str
    kind: Literal["food", "group"]
    count: int
    kcal: float


@dataclass(frozen=True)
class Stats:
    start: date
    end: date
    today: date
    days_possible: int
    days_logged: int
    average: Macros | None
    target_average: Macros | None
    targets_vary: bool
    tolerance: float
    in_range: dict[str, int]
    previous: Previous
    trailing_kcal: list[tuple[date, float | None]]
    weekdays: list[float | None]
    times_of_day: dict[TimeOfDay, float]
    top: list[TopItem]


def _mean(values: list[float]) -> float | None:
    return round(sum(values) / len(values), 1) if values else None


def _mean_macros(values: list[Macros] | list[Targets]) -> Macros | None:
    if not values:
        return None
    return Macros(**{name: _mean([getattr(v, name) for v in values]) for name in FIELDS})


def in_range(actual: float, goal: float, tolerance: float) -> bool:
    """Zielbereich: at most the tolerance away from the goal."""
    return abs(actual - goal) <= tolerance * goal


def _top(items: Iterable[EatenItem]) -> list[TopItem]:
    """Entries of a plate count once per plate under its name, the others under the food."""
    plates: dict[UUID, tuple[str, float]] = {}
    count: Counter[tuple[str, int | str]] = Counter()
    kcal: defaultdict[tuple[str, int | str], float] = defaultdict(float)
    names: dict[tuple[str, int | str], str] = {}
    for item in items:
        if item.group_id is None:
            key = ("food", item.food_id)
            names[key] = item.food_name
            count[key] += 1
            kcal[key] += item.kcal
        else:
            name, total = plates.get(item.group_id, (item.group_name or "", 0.0))
            plates[item.group_id] = (name, total + item.kcal)
    for name, total in plates.values():
        key = ("group", name)
        names[key] = name
        count[key] += 1
        kcal[key] += total
    ranked = sorted(count, key=lambda key: (-count[key], -kcal[key]))[:TOP_COUNT]
    return [TopItem(names[key], key[0], count[key], round(kcal[key], 1)) for key in ranked]


def statistics(
    start: date,
    end: date,
    today: date,
    logged: Mapping[date, Macros],
    items: Iterable[EatenItem],
    goals: Goals,
    tolerance: float,
) -> Stats:
    """`logged`: the totals of the days with entries, from the previous period and the six
    days before `start` up to `end`; `items`: the entries from `start` to `end`."""
    closed = {day: totals for day, totals in logged.items() if day < today}
    period = days_of(start, end)
    days = [day for day in period if day in closed]
    targets = [goals.of(day) for day in days]

    previous_start, previous_end = previous_period(start, end)
    previous = [closed[day].kcal for day in days_of(previous_start, previous_end) if day in closed]

    trailing: list[tuple[date, float | None]] = []
    for day in period:
        window = [day - timedelta(days=back) for back in range(TRAILING_DAYS)]
        kcal = [closed[d].kcal for d in window if d in closed]
        trailing.append((day, None if day >= today else _mean(kcal)))

    weekdays = [_mean([closed[day].kcal for day in days if day.weekday() == wd]) for wd in range(7)]

    counted = [item for item in items if item.day in closed and start <= item.day <= end]
    by_time: dict[TimeOfDay, float] = dict.fromkeys(_TIME_OF_MEAL.values(), 0.0)
    for item in counted:
        by_time[time_of_day(item.eaten_at)] += item.kcal
    total_kcal = sum(by_time.values())
    shares = {name: value / total_kcal if total_kcal else 0.0 for name, value in by_time.items()}

    return Stats(
        start=start,
        end=end,
        today=today,
        days_possible=sum(1 for day in period if day < today),
        days_logged=len(days),
        average=_mean_macros([closed[day] for day in days]),
        target_average=_mean_macros(targets),
        targets_vary=len(set(targets)) > 1,
        tolerance=tolerance,
        in_range={
            name: sum(
                1
                for day, goal in zip(days, targets, strict=True)
                if in_range(getattr(closed[day], name), getattr(goal, name), tolerance)
            )
            for name in FIELDS
        },
        previous=Previous(previous_start, previous_end, _mean(previous)),
        trailing_kcal=trailing,
        weekdays=weekdays,
        times_of_day=shares,
        top=_top(counted),
    )
