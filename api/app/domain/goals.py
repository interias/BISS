"""Daily goals: a goal for the day, else the stored default, else the .env defaults."""

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


def stored_goal(session: Session, day: date | None) -> Goal | None:
    """The stored goal of a day; day None is the stored default."""
    condition = Goal.day.is_(None) if day is None else Goal.day == day
    return session.scalars(select(Goal).where(condition)).first()


def _targets(goal: Goal) -> Targets:
    return Targets(kcal=goal.kcal, protein=goal.protein, carbs=goal.carbs, fat=goal.fat)


def default_goal(session: Session, settings: Settings | None = None) -> Targets:
    """The stored default, else the defaults from the environment."""
    goal = stored_goal(session, None)
    return default_targets(settings) if goal is None else _targets(goal)


def targets_for(session: Session, day: date, settings: Settings | None = None) -> Targets:
    """Return the goals that apply to the given day."""
    goal = stored_goal(session, day)
    return default_goal(session, settings) if goal is None else _targets(goal)
