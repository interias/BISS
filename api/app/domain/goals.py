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


def targets_for(session: Session, day: date, settings: Settings | None = None) -> Targets:
    """Return the goals that apply to the given day."""
    for candidate in (Goal.day == day, Goal.day.is_(None)):
        goal = session.scalars(select(Goal).where(candidate)).first()
        if goal is not None:
            return Targets(kcal=goal.kcal, protein=goal.protein, carbs=goal.carbs, fat=goal.fat)
    return default_targets(settings)
