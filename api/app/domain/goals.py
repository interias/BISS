"""Daily goals: the goal of the day, else the newest default up to that day, else the .env
defaults (SPEC 4, ADR-0015)."""

from bisect import bisect_right
from dataclasses import dataclass
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.models import Goal


@dataclass(frozen=True)
class Targets:
    kcal: float
    protein: float
    carbs: float
    fat: float


def default_targets(settings: Settings | None = None) -> Targets:
    """Default goals from the environment (2,400 / 160 / 260 / 75 unless configured)."""
    settings = settings or get_settings()
    return Targets(
        kcal=settings.goal_kcal,
        protein=settings.goal_protein,
        carbs=settings.goal_carbs,
        fat=settings.goal_fat,
    )


def carbs_remainder(kcal: float, protein: float, fat: float) -> float:
    """The carbs that make protein and fat add up to the kcal, unrounded.

    Raises ValueError when protein and fat alone exceed the kcal.
    """
    carbs = (kcal - 4 * protein - 9 * fat) / 4
    if carbs < 0:
        raise ValueError(
            f"protein and fat alone come to {4 * protein + 9 * fat:g} kcal, "
            f"more than the goal of {kcal:g} kcal"
        )
    return carbs


def stored_goal(session: Session, day: date) -> Goal | None:
    """The stored goal of a single day."""
    return session.scalars(select(Goal).where(Goal.day == day)).first()


def stored_default(session: Session, valid_from: date) -> Goal | None:
    """The stored default that starts on the given day."""
    return session.scalars(select(Goal).where(Goal.valid_from == valid_from)).first()


def _targets(goal: Goal) -> Targets:
    return Targets(kcal=goal.kcal, protein=goal.protein, carbs=goal.carbs, fat=goal.fat)


@dataclass(frozen=True)
class Goals:
    """All stored goals, loaded once, so a range of days needs no query per day."""

    days: dict[date, Targets]
    # Stored defaults by start day, oldest first.
    defaults: list[tuple[date, Targets]]
    fallback: Targets

    def default_on(self, day: date) -> tuple[date | None, Targets]:
        """The default that applies on the day with its start; None: the .env defaults."""
        index = bisect_right([start for start, _ in self.defaults], day)
        return self.defaults[index - 1] if index else (None, self.fallback)

    def of(self, day: date) -> Targets:
        """The goal of the day: its own one, else the default that applies on it."""
        return self.days.get(day) or self.default_on(day)[1]


def load_goals(session: Session, settings: Settings | None = None) -> Goals:
    rows = session.scalars(select(Goal)).all()
    return Goals(
        days={row.day: _targets(row) for row in rows if row.day is not None},
        defaults=sorted(
            ((row.valid_from, _targets(row)) for row in rows if row.valid_from is not None),
            key=lambda pair: pair[0],
        ),
        fallback=default_targets(settings),
    )


def targets_for(session: Session, day: date, settings: Settings | None = None) -> Targets:
    """Return the goals that apply to the given day."""
    return load_goals(session, settings).of(day)
